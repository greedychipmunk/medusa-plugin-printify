/**
 * Effective storefront visibility for a Printify product.
 *
 * Upstream publication is mandatory. Local intent may hide a published
 * product but must never force-show an upstream draft. A locked product is
 * still publishing, not ready for public discovery. The publish handshake
 * prepares a private Medusa draft so it can acknowledge Printify without
 * leaking the product early or deadlocking publication.
 * Missing/malformed publication or lock facts fail closed.
 */
export type EffectiveVisibility = "published" | "draft"

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

/** The publish request has finished: unlocked with a valid external record.
 * Unlock alone is insufficient because publishing_failed also unlocks a
 * product. Says nothing about storefront visibility. */
export function isPublicationComplete(value: unknown): boolean {
  const product = record(value)
  if (product?.is_locked !== false) return false
  const external = record(product.external)
  return typeof external?.id === "string" && external.id.trim().length > 0 &&
    typeof external?.handle === "string" && external.handle.trim().length > 0
}

/** Storefront eligibility: a completed publication that Printify also marks
 * visible. Printify's `visible` defaults to true, including untouched drafts,
 * so it is never publication evidence on its own. */
export function isPrintifyPublished(value: unknown): boolean {
  return record(value)?.visible === true && isPublicationComplete(value)
}

/** Printify is waiting for this integration to answer a publish request.
 * The lock is the authoritative signal; `visible` is irrelevant here because
 * products hidden in Printify are published (locked) with `visible: false`.
 * See docs/2026-11-08_publish-handshake-hidden-products.md. */
export function isPrintifyPublishing(value: unknown): boolean {
  return record(value)?.is_locked === true
}

export function computeEffectiveVisibility(pp: {
  is_published: boolean
  is_locked?: boolean
  visibility_override?: boolean | null
  printify_data?: unknown
}): EffectiveVisibility {
  if (pp.is_published !== true || pp.is_locked !== false) return "draft"
  if (!isPrintifyPublished(pp.printify_data)) return "draft"
  if (pp.visibility_override === undefined || pp.visibility_override === null || pp.visibility_override === true) {
    return "published"
  }
  return "draft"
}
