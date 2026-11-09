import type { PrintifyImage } from "../modules/printify/api-client"

/**
 * The product's primary Printify mockup, used as the Medusa thumbnail that
 * storefront product lists render.
 *
 * Printify flags `is_default` on one image per color; the first one in
 * Printify's order is the primary mockup (the same rule the admin list uses).
 * Falls back to the first image, and to null when there are no images so a
 * stale thumbnail is cleared rather than kept.
 *
 * Always pass this explicitly: Medusa only derives a thumbnail from images[0]
 * on create and never updates it afterwards.
 */
export function selectPrimaryImage(images: PrintifyImage[] | null | undefined): string | null {
  if (!images?.length) return null
  const primary = images.find((img) => img?.is_default === true && img.src) ?? images.find((img) => img?.src)
  return primary?.src ?? null
}
