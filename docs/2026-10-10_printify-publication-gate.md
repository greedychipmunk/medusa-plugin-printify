# Printify publication gate

Date: 2026-10-10

The full cross-repository plan is saved in the local multi-repo workspace at
`ecommerce/docs/2026-10-10_printify-published-products-only.md`. This repository's
implementation plan is summarized below so it remains usable independently.

Invariant: a Printify product is public only after Printify confirms `visible ===
true` and `is_locked === false`, and the merchant has not explicitly hidden it.
It must also have Printify's successful external publication record (nonempty
`external.id` and `external.handle`). Printify's `visible` defaults to true and
cannot establish publication alone. Verify the raw snapshot, not legacy booleans.
Local overrides must never force-show an upstream draft. Private Medusa drafts
may be prepared to complete the custom-integration publishing handshake.

The implementation and regression tests in this plugin enforce that invariant;
the coordinated rollout also updates the consuming backend version and removes
stale storefront catalog caching.

## Changes

1. Refresh upstream visibility and lock facts on every sync, regardless of local
   intent. Stop allowing the admin request to overwrite the upstream flag.
2. Use one publication policy across sync, admin mutations, and reconciliation.
   Demote linked ineligible products before mapping/variant validation can skip them.
3. Prepare pending publications as private Medusa drafts; acknowledge Printify,
   then synchronize verified completion. A failed acknowledgment/read remains private.
4. Reject admin force-show of upstream drafts/publishing products; preserve hiding
   and clearly distinguish upstream status from storefront visibility in the UI.
5. Reconcile previously contaminated flags from a fresh upstream read; never delete
   product IDs, variants, or historical orders as a visibility repair.

## Tests and release

Cover publication × lock × override, missing/invalid facts, sync demotion despite
invalid mappings, admin failures, publish handshake failures/success, and repeated
delivery. Run Jest and the plugin build. Merge through protected CI with a `fix:`
PR title and let CI publish the version; do not manually edit package version.
The consuming backend must adopt the release before production reconciliation.
The storefront's separate fix removes indefinite catalog caching and verifies
absence from discovery and direct product URLs after cache warming/unpublication.
