import type { CachedVariant } from "./variant-availability-cache"

/**
 * Parse variant data from Printify's raw product JSON.
 *
 * Cross-references `options[]` to resolve human-readable option names/values
 * and `images[]` to attach relevant image URLs per variant.
 */
export function parseVariantsFromPrintifyData(printifyData: any): CachedVariant[] {
  if (!printifyData || !Array.isArray(printifyData.variants)) {
    return []
  }

  const options: Array<{ name: string; values: Array<{ id: number; title: string }> }> =
    Array.isArray(printifyData.options) ? printifyData.options : []

  const images: Array<{ src: string; variant_ids: number[] }> =
    Array.isArray(printifyData.images) ? printifyData.images : []

  // Build a lookup: option value ID → { optionName, valueTitle }
  const optionValueMap = new Map<number, { name: string; title: string }>()
  for (const option of options) {
    if (!Array.isArray(option.values)) continue
    for (const value of option.values) {
      optionValueMap.set(value.id, { name: option.name, title: value.title })
    }
  }

  return printifyData.variants.map((variant: any) => {
    // Resolve option IDs to readable key-value pairs
    const resolvedOptions: Record<string, string> = {}
    if (Array.isArray(variant.options)) {
      for (const optionValueId of variant.options) {
        const mapping = optionValueMap.get(optionValueId)
        if (mapping) {
          resolvedOptions[mapping.name] = mapping.title
        }
      }
    }

    // Find images that reference this variant
    const variantImages: string[] = []
    for (const image of images) {
      if (Array.isArray(image.variant_ids) && image.variant_ids.includes(variant.id)) {
        if (image.src) {
          variantImages.push(image.src)
        }
      }
    }

    return {
      id: variant.id,
      title: variant.title || "",
      sku: variant.sku || "",
      price: variant.price ?? 0,
      compare_at_price: variant.cost ?? 0,
      options: resolvedOptions,
      is_available: variant.is_available ?? false,
      is_enabled: variant.is_enabled ?? false,
      images: variantImages,
    }
  })
}
