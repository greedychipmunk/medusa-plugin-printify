# Plan: product lists show the primary Printify mockup

Date: 2026-11-08
Repos: medusa-plugin-printify (fix), trendtri (version bump + deploy)

## Problem

Storefront product cards (store, collections, search, home hero/collection tiles,
cart line items) render `product.thumbnail`. The thumbnail usually differs from
the product's primary mockup in Printify.

## Root cause

The plugin's product sync (`src/workflows/sync-products.ts`) never sets
`thumbnail`. It passes only `images`. Medusa's product module fills a missing
thumbnail from `images[0]` **on create only**
(`normalizeCreateProductInput`). Updates never touch it. So each product kept
whatever image was first when it was created. Printify regenerates mockup URLs
when a design or mockup selection changes, so the original URL goes stale.

Live evidence (production, 2026-11-08, linked products):

| status | total | thumbnail = primary | thumbnail URL no longer in product images | thumbnail = another image |
|---|---|---|---|---|
| published | 70 | 15 | 38 | 17 |
| draft | 10 | 3 | 6 | 1 |

55 of 70 published products (79%) show the wrong card image.

The storefront prefers `thumbnail` over `images[0]` (`Thumbnail` component), and
product fetches are `cache: "no-store"`. A correct backend thumbnail is
therefore visible on the next page load. No storefront change is needed.

## What "primary mockup" means

Printify marks `is_default: true` on one image **per color**. Multi-color
products have several defaults (e.g. 8 for a hoodie in 8 colors). The primary
mockup is the **first `is_default` image in Printify's order**. In live data it
sits at index 0 for every product. This is the same rule the plugin's admin
product list already uses (`images.find(i => i.is_default) ?? images[0]`).
Picking the default variant's image instead was rejected: for 2 products it
points at a later color, and default variants can be disabled.

Fallbacks: no `is_default` image → `images[0]`; no images → `null`, so a stale
URL is cleared.

## Changes

1. `src/workflows/primary-image.ts`: pure `selectPrimaryImage(images)`
   returning the primary image's `src` (or `null`), using the rule above.
2. `sync-products.ts`: pass `thumbnail: selectPrimaryImage(printifyImages)` in
   all three product writes (create, update with pricing, update without
   pricing). Every hourly or webhook sync then re-asserts it, which also
   repairs the 55 existing products on the first post-deploy sync. No backfill
   script, no migration.
3. Tests:
   - unit tests for `selectPrimaryImage` (default-first, multiple defaults,
     default not at index 0, no default, empty or missing).
   - sync tests asserting `thumbnail` on create and both update paths,
     including a product whose stale thumbnail must be replaced.

Out of scope (noted, not changed): the product detail gallery's image ranking
is off for 2 published products. That is a separate Medusa update-ordering
quirk and does not affect product lists.

## Rollout and verification

1. Plugin PR (`fix:`), CI green, squash-merge, CI publishes the next patch.
2. trendtri PR bumping `medusa-plugin-printify`, factory CI, merge, Coolify
   deploy. Confirm the container runs the new version.
3. After the first post-deploy sync (on boot or hourly): re-run the
   thumbnail-vs-primary SQL and expect `thumbnail = primary` for every
   published product.
4. Storefront spot check: card image `src` for a previously stale product
   (e.g. "Knight License Plate - Navy", "FastAPI Cheatsheet Desk Mat") matches
   its Printify primary mockup.
