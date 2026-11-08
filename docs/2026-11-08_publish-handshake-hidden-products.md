# Printify publishing stuck for hidden products — permanent fix

Date: 2026-11-08

## Symptom

Publishing "Software Factory Cheatsheet Desk Mat" (`6ad01b0fcf818bcb480840d7`)
from Printify hung in **Publishing**, then fell back to **Unpublished changes**.
A second publish attempt is stuck in **Publishing** again.

## Evidence (production, 2026-11-08)

Live Printify product state during the second attempt:

```
visible: false   is_locked: true   updated_at: 2026-11-08 22:29:17
external: { id: prod_01M4YH8HC67SJXWTN1Y6MANQSY,
            handle: https://trendtriumph.com/products/software-factory-architecture-cheatsheet-desk-mat-agent-native-delivery }
```

The product was published earlier (it has an `external` record). It is hidden in
Printify (`visible: false`). The plugin never writes `visible`, so the hidden
flag was set in Printify. Eight other products are also hidden, but none of them
is locked. The desk mat is the only stuck product.

Backend log, `medusa-plugin-printify@0.3.21`, five `product:publish:started`
deliveries between 22:29:56 and 22:36:42 UTC. Each one ended with:

```
[printify] webhook: {"stage":"verify_pending", ..., "acknowledged":false,
  "error":"Printify request is neither pending nor positively completed"}
```

Every delivery's HTTP log line has `status: null, duration: null`: Printify gave
up on the response before the handler finished. Each run took about 40–50 s,
for example prepare at 22:30:36 and failure at 22:31:26. Printify redelivered
every ~30 s, so up to three full-catalog syncs ran at the same time.

Printify API docs: "For custom (API) stores, the product remains locked until
publishing_succeeded or publishing_failed is called; if neither is received
within 1 hour, the product is automatically unlocked and returned to its
unpublished state." That one-hour unlock is the "Unpublished changes" state.

## Root causes

1. **Pending detection requires `visible === true`.**
   `isPrintifyPublishing()` returns `visible === true && is_locked === true`.
   A publish request for a product hidden in Printify is locked but has
   `visible: false`, so the handler decides it is "neither pending nor
   completed". It never calls `publishing_succeeded`, and it never calls
   `publishing_failed` either, because `pending` is false. Printify waits an
   hour and then reverts. This happens every time for any hidden product, and
   it is the deterministic failure.
   - The 2026-10-10 publication gate conflated two separate questions.
     **Has the publish request completed?** That is `is_locked` plus `external`.
     **May the storefront show it?** That additionally requires `visible === true`.
     `visible` belongs only in the second.
   - The same conflation affects the completed-repeat check and the
     post-acknowledgment confirmation. Both use `isPrintifyPublished`, which
     needs `visible`. A hidden product would still fail after a successful
     acknowledgment.
2. **The webhook does ~45 s of work before responding.** Every
   `product:publish:started` runs a full-catalog `syncProductsWorkflow`
   (75 products, about 1,200 variant-image pairs on large items) inside the
   request. Printify abandons the request, records a failure, and redelivers. The
   overlapping full syncs race on the same rows. Even with cause 1 fixed, the
   handshake depends on a request that Printify has already given up on.
3. **No safety net.** When a handshake does not complete (crash, deploy restart,
   API blip, abandoned request), nothing retries it before Printify's one-hour
   auto-unlock. `scripts/reconcile-publishing.ts` exists but is manual. It also
   copies the webhook logic, including bug 1, so it would skip this product too.

## Fix

### 1. Separate "publish request completed" from "storefront eligible" (`workflows/visibility.ts`)

- `isPrintifyPublishing(p)` becomes `p.is_locked === true`. The lock is
  Printify's authoritative "waiting for the integration" signal; `visible` is
  irrelevant to it. Unlocked drafts still are not pending, so unrelated requests
  are still never acknowledged.
- Add `isPublicationComplete(p)`: `is_locked === false` and a valid
  `external.id`/`external.handle`.
- `isPrintifyPublished(p)`, which decides storefront eligibility, becomes
  `visible === true && isPublicationComplete(p)`. The behavior is unchanged, and
  so is the storefront invariant: a hidden product never shows.

### 2. One shared handshake, run off the request path

- Move the handshake out of the route into one shared function,
  `completePublishHandshake(container, shopId, printifyId)` in
  `src/lib/publish-handshake.ts`. The webhook, the reconcile script and the new
  job all call it, which removes the duplicate logic.
  - The stages are unchanged: private prepare (sync), verify pending, link,
    defensive draft, acknowledge, confirmed refresh, final sync.
  - The completed-repeat check and the post-acknowledgment confirmation use
    `isPublicationComplete`.
  - The final sync applies `computeEffectiveVisibility`, so a hidden product
    completes publishing but stays draft on the storefront.
  - `publishing_failed` is still reported only for a verified pending request
    that was not acknowledged.
- **Single-flight per product.** An in-memory map keyed by Printify product ID
  stops duplicate deliveries, and the reconcile job, from running concurrent
  handshakes. The backend runs one Medusa process in shared worker mode, so
  in-process deduplication is enough.
- **Webhook acknowledges first.** After the signature check, the
  `product:publish:started` create/update branch responds `200` and starts the
  handshake in the background. Failures are logged with the structured stage
  context that already exists. The `delete` action and unsupported actions stay
  synchronous, because they only demote the product and are fast. Printify then
  stops redelivering and stacking syncs.

### 3. Scheduled safety net (`jobs/reconcile-publishing-job.ts`)

- Every 10 minutes, list the shop's products and run `completePublishHandshake`
  for each `is_locked === true` product.
  - Cost: two list calls per run. Handshakes run only for locked products,
    which is normally none.
  - A lost webhook therefore completes within about 10 minutes, well inside
    Printify's one-hour auto-unlock.
- `scripts/reconcile-publishing.ts` keeps its CLI contract (summary line,
  non-zero exit on failure) but delegates to the shared function.

### 4. Tests

- Visibility matrix:
  - Locked plus `visible: false` is pending.
  - Unlocked with no `external` is not pending.
  - Hidden but complete counts as `isPublicationComplete` and not as
    `isPrintifyPublished`.
- Webhook:
  - **Regression:** a hidden locked product is acknowledged with `id`/`handle`,
    stays draft, and never triggers `publishing_failed`.
  - The response is sent before the handshake finishes.
  - Concurrent duplicate deliveries run one handshake.
  - Existing ordering, failure and demotion tests keep passing.
- Reconcile job: acknowledges locked products only, skips unlocked ones, and
  survives a per-product failure.
- Reconcile script: existing tests updated for the shared function.

## Release and repair

1. Plugin PR titled `fix: complete Printify publish handshake for hidden products`.
   CI publishes `0.3.22` on merge.
2. Bump `medusa-plugin-printify` in `trendtri` to `0.3.22` (package and lockfile)
   in a focused PR, then deploy the backend and confirm the running version.
3. The desk mat's current lock started at 22:29 UTC, so Printify auto-unlocks it
   at about 23:29 UTC.
   - If it is still locked after deploy, the new job completes it within 10 minutes.
   - Otherwise, publish it once more from Printify.
   - Expected result: Printify shows **Published** within about a minute, and
     the backend logs the `acknowledge` and `confirmed_refresh` stages.
4. **Storefront visibility.** The desk mat is set to hidden in Printify, so after
   publishing it stays off the storefront by design (2026-10-10 invariant:
   Printify is the visibility authority). Choosing **Show in store** in Printify
   puts it on the storefront at the next sync.

## Verification

- Plugin: `pnpm test`, `pnpm build`.
- Production:
  - Backend runs 0.3.22.
  - The publish webhook returns 200 promptly (the HTTP log has a real status
    and duration).
  - The desk mat goes to `is_locked: false` with `external` set.
  - No product stays locked past one job interval.
  - Storefront publication mismatch is zero: hidden products remain absent and
    known published products still resolve.

## Out of scope

Order flows, pricing, and the storefront. No schema migration. The policy that
decides storefront visibility is unchanged; only the publish-request detection
and the handshake execution change.
