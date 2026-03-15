import type { PrintifyOption, PrintifyVariant, PrintifyImage } from "../modules/printify/api-client"

export type OptionMapResult = {
  medusaOptions: { title: string; values: string[] }[]
  variantOptionMap: Map<number, Record<string, string>>
  variantImageMap: Map<number, { url: string }[]>
}

export function mapPrintifyOptions(
  options: PrintifyOption[],
  variants: PrintifyVariant[],
  images: PrintifyImage[]
): OptionMapResult | null {
  if (!options || options.length === 0) {
    return null
  }

  // Build lookup: option value ID -> { optionName, valueTitle }
  const valueLookup = new Map<number, { optionName: string; valueTitle: string }>()
  for (const opt of options) {
    for (const val of opt.values) {
      valueLookup.set(val.id, { optionName: opt.name, valueTitle: val.title })
    }
  }

  const enabledVariants = variants.filter((v) => v.is_enabled)

  if (enabledVariants.length === 0) {
    return null
  }

  // Build variant option map: printify variant ID -> { OptionName: ValueTitle }
  const variantOptionMap = new Map<number, Record<string, string>>()
  for (const v of enabledVariants) {
    const optionValues: Record<string, string> = {}
    for (const valId of v.options) {
      const lookup = valueLookup.get(valId)
      if (lookup) {
        optionValues[lookup.optionName] = lookup.valueTitle
      }
    }
    variantOptionMap.set(v.id, optionValues)
  }

  // Collect only option values used by enabled variants
  const usedValueIds = new Set<number>()
  for (const v of enabledVariants) {
    for (const valId of v.options) {
      usedValueIds.add(valId)
    }
  }

  // Build Medusa options with only used values, preserving Printify option order
  const medusaOptions = options
    .map((opt) => ({
      title: opt.name,
      values: [...new Set(
        opt.values
          .filter((val) => usedValueIds.has(val.id))
          .map((val) => val.title)
      )],
    }))
    .filter((opt) => opt.values.length > 0)

  // Build variant image map: printify variant ID -> image URLs
  const enabledIds = new Set(enabledVariants.map((v) => v.id))
  const variantImageMap = new Map<number, { url: string }[]>()
  for (const img of images) {
    if (!img.variant_ids) continue
    for (const vid of img.variant_ids) {
      if (!enabledIds.has(vid)) continue
      if (!variantImageMap.has(vid)) {
        variantImageMap.set(vid, [])
      }
      variantImageMap.get(vid)!.push({ url: img.src })
    }
  }

  return { medusaOptions, variantOptionMap, variantImageMap }
}
