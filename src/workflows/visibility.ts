/**
 * Effective storefront visibility for a Printify product.
 *
 * Single source of truth for the three-state override system:
 * - visibility_override = true  → always visible (overrides Printify)
 * - visibility_override = false → always hidden (overrides Printify)
 * - visibility_override = null → follow Printify's published state
 *
 * IMPORTANT on is_locked: for custom_integration shops a product stays
 * locked from Printify's "publish" click until THIS plugin acknowledges via
 * publishing_succeeded/publishing_failed. So locked+visible must be treated
 * as published — otherwise the Medusa product is never created and the
 * handshake can never complete (the "stuck in Publishing forever" bug).
 * is_locked is therefore informational (persisted for tooling/queries), not
 * a visibility input.
 */
export type EffectiveVisibility = "published" | "draft"

export function computeEffectiveVisibility(pp: {
  is_published: boolean
  visibility_override?: boolean | null
}): EffectiveVisibility {
  if (pp.visibility_override === true) return "published"
  if (pp.visibility_override === false) return "draft"
  return pp.is_published ? "published" : "draft"
}
