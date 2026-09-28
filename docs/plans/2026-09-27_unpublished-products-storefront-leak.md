# Bug fix plan: unpublished Printify products must not show in the storefront

**Date:** 2026-09-27
**Repo:** medusa-plugin-printify
**Symptom (reported):** Products that are not published in Printify are appearing on the TrendTri storefront.

## Current state analysis

There are three visibility signals, and they don't compose correctly:

| Signal | Source | Meaning |
|---|---|---|
| `printify_product.is_published` | Printify `visible` flag, synced hourly (`upsertProductsStep`) | Printify's own publish state |
| `printify_product.visibility_override` | Admin PATCH route (null = follow Printify) | Admin override |
| Medusa `product.status` | `createMedusaProductsStep` / admin PATCH | What the storefront actually reads |

### Where the bugs are

**Bug 1 — `visibility_override` is ignored by the Medusa status decision.**
`createMedusaProductsStep` computes `targetStatus = pp.is_published ? "published" : "draft"` (sync-products.ts:337) from `is_published` alone. The three-state system documented in the README (`null` → follow Printify, `true` → always visible, `false` → always hidden) is only half-implemented: the admin PATCH route writes `visibility_override`, but the sync never reads it. If an admin hides a product (override `false`), the next hourly sync re-publishes it (if Printify still says visible). Conversely an override `true` on an unpublished Printify product is never honored at the Medusa layer.

**Bug 2 — `is_published` ignores `is_locked`.**
`upsertProductsStep` computes `printifyPublished = product.visible && !product.is_locked` (sync-products.ts:55), but `createMedusaProductsStep` uses raw `pp.is_published` for the create-skip (line 296) and `targetStatus` (line 337). A product that Printify has locked (e.g. stuck "Publishing") stays `is_published: true` locally and keeps its Medusa `published` status even though it is not actually live in Printify. This is exactly the state the 13 stuck products were in — if any of them had been created as published before locking, they would leak.

**Bug 3 — `is_locked` is not persisted.**
`printify_data` holds the raw Printify payload (which includes `is_locked`), but there is no first-class `is_locked` column, so queries can't cheaply reason about it and the sync steps disagree about what "published" means.

**Bug 4 — no reconciliation for drift.**
If a product's status drifts (manual admin edits in Medusa, failed sync steps, webhook races), nothing except a full hourly sync re-derives Medusa `status` from the Printify signals. The Printify 8502 saga taught us direct event paths drop things; the same reconciliation discipline applies here.

### Production check (2026-09-27)

Queried prod for Medusa products with `status='published'` where `printify_product.is_published = false` OR `visibility_override = false`: **0 rows**. So the leak is latent (code-level), not currently live in prod — the fix is preventive, plus it closes the override gap that would make the admin hide-toggle a lie.

## Fix plan

### PR 1 — plugin: effective visibility computation (core fix)

`src/workflows/sync-products.ts`:

1. **Add `is_locked` to the model** (`src/modules/printify/models/product.ts`: `is_locked: model.boolean().default(false)`), persist it in `upsertProductsStep` data, generate migration (`pnpm medusa plugin:db:generate`). *(This also makes the publish-handshake state queryable for future tooling.)*
2. **Extract a single pure function** `computeEffectiveVisibility(pp)` in a new `src/workflows/visibility.ts`:
   - `visibility_override === true` → `published`
   - `visibility_override === false` → `draft`
   - otherwise → `is_published && !is_locked ? "published" : "draft"`
   - Unit-test the 3×2+ matrix exhaustively (override null/true/false × published/unpublished × locked/unlocked).
3. **Use it in `createMedusaProductsStep`**:
   - create-skip guard (line 296): skip creation when effective visibility is `draft`
   - `targetStatus` (line 337): use `computeEffectiveVisibility(pp)` instead of raw `is_published`
4. **Tests**: extend `tests/unit/workflows/sync-products.test.ts` —
   - admin-hidden (override `false`) product stays/becomes `draft` on sync
   - override `true` keeps `published` even when Printify unpublished
   - locked product flips to `draft`
   - create-skip still applies to unpublished products
5. Release: `fix:` PR → patch (0.3.15).

### PR 2 — trendtri: bump + verify

1. Bump `medusa-plugin-printify` to `^0.3.15`, merge, deploy (Coolify auto-deploy).
2. **Post-deploy verification** (SSH to prod):
   - `docker exec <pg> psql -U medusa -d medusa -c "SELECT ... WHERE pr.status='published' AND (pp.is_published=false OR pp.visibility_override=false OR pp.is_locked=true)"` → expect 0 rows
   - Storefront spot-check: hidden product handle returns 404 via Store API
   - Next hourly sync logs: `created/updated` counts unchanged for the 17 published products
3. **Storefront cache gotcha** (from the publishing saga): if a product was previously visible, its Store API response may be cached in the Next.js fetch cache baked into the storefront image. If a hidden product still renders, clear `/app/.next/cache/fetch-cache/*` in the storefront container and restart it.

### PR 3 (optional, hardening) — reconciliation job

A small `reconcile-visibility-job` (e.g. every 6h): re-derive effective visibility for every linked product and fix Medusa `status` drift, logging a summary line (scanned/corrected counts). This is the "every event-driven path has a reconcile job behind it" discipline from the crypto-rewards AGENTS.md — cheap insurance against future drift. Defer unless Dawson wants it now.

## Out of scope (noted, not fixed here)

- The admin PATCH route's `visibility_override` semantics stay as-is (no UI reset path to `null` — documented behavior).
- Storefront fetch-cache revalidation (longer-term candidate, already noted in project memory).
- Printify webhook `product:updated` triggering full-shop sync (existing known issue).

## Verification checklist (done = plan complete)

- [ ] PR 1 merged, 0.3.15 on npm
- [ ] PR 2 merged, deployed, prod query returns 0 leaked products
- [ ] Storefront shows no hidden products; admin hide-toggle verified to survive a sync
- [ ] Memory updated with the visibility-composition rule
