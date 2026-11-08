import type { IProductModuleService } from "@medusajs/types"

export type ExistingProductOption = {
  id: string
  title: string
  is_exclusive?: boolean
  values?: { value: string }[]
}

export type TargetProductOption = { title: string; values: string[] }

export type OptionReconcilePlan = {
  /** Target title → existing option id, for exact-title matches */
  matched: Map<string, string>
  /** Product-exclusive options to rename in place (Printify renamed the option) */
  renames: { id: string; from: string; to: string }[]
  /** Target options with no existing counterpart — created product-exclusive */
  creates: TargetProductOption[]
}

/**
 * Decide how to bring a linked Medusa product's options in line with
 * Printify's, without creating store-wide ("global") options.
 *
 * Printify sometimes renames a product's options (e.g. "Sizes" →
 * "Clothing sizes"). Matching by title alone then looks like a brand-new
 * option, and `createProductOptions` defaults to a global option — which
 * Medusa 2.21 constrains to a unique title store-wide
 * (IDX_product_option_global_title_unique). The second product hitting the
 * same rename fails forever with "Product option with title: …, already exists".
 *
 * Instead:
 *   1. exact title matches are kept;
 *   2. each remaining Printify option is paired with the unmatched existing
 *      product-exclusive option sharing the most values, and that option is
 *      renamed in place (variants keep their option values);
 *   3. anything still unmatched is created product-exclusive.
 * Global options are never renamed — they may belong to other products.
 */
export function planOptionReconciliation(
  existing: ExistingProductOption[],
  targets: TargetProductOption[]
): OptionReconcilePlan {
  const matched = new Map<string, string>()
  const usedExistingIds = new Set<string>()
  const existingByTitle = new Map(existing.map((opt) => [opt.title, opt]))

  const unmatchedTargets: TargetProductOption[] = []
  for (const target of targets) {
    const hit = existingByTitle.get(target.title)
    if (hit && !usedExistingIds.has(hit.id)) {
      matched.set(target.title, hit.id)
      usedExistingIds.add(hit.id)
    } else {
      unmatchedTargets.push(target)
    }
  }

  const renameCandidates = existing.filter(
    (opt) => opt.is_exclusive === true && !usedExistingIds.has(opt.id)
  )

  const pairs: { targetIndex: number; existingIndex: number; overlap: number }[] = []
  unmatchedTargets.forEach((target, targetIndex) => {
    const targetValues = new Set(target.values)
    renameCandidates.forEach((opt, existingIndex) => {
      const overlap = (opt.values ?? []).filter((v) => targetValues.has(v.value)).length
      if (overlap > 0) pairs.push({ targetIndex, existingIndex, overlap })
    })
  })
  // Strongest overlap first; ties resolve in Printify option order, then existing order
  pairs.sort(
    (a, b) => b.overlap - a.overlap || a.targetIndex - b.targetIndex || a.existingIndex - b.existingIndex
  )

  const renames: OptionReconcilePlan["renames"] = []
  const pairedTargets = new Set<number>()
  const pairedExisting = new Set<number>()
  for (const pair of pairs) {
    if (pairedTargets.has(pair.targetIndex) || pairedExisting.has(pair.existingIndex)) continue
    pairedTargets.add(pair.targetIndex)
    pairedExisting.add(pair.existingIndex)
    const opt = renameCandidates[pair.existingIndex]
    renames.push({ id: opt.id, from: opt.title, to: unmatchedTargets[pair.targetIndex].title })
  }

  const creates = unmatchedTargets.filter((_, i) => !pairedTargets.has(i))
  return { matched, renames, creates }
}

/**
 * Apply a reconciliation plan. Returns target title → option id for every
 * Printify option (matched, renamed, or created).
 */
export async function applyOptionReconciliation(
  productModuleService: IProductModuleService,
  plan: OptionReconcilePlan
): Promise<Map<string, string>> {
  const optionIdByTitle = new Map(plan.matched)

  for (const rename of plan.renames) {
    await productModuleService.updateProductOptions(rename.id, { title: rename.to })
    optionIdByTitle.set(rename.to, rename.id)
  }

  if (plan.creates.length > 0) {
    // `is_exclusive` (Medusa 2.21) is not in the plugin's compile-time types.
    // Exclusive options are scoped to one product, so they never collide with
    // the store-wide unique title index on global options.
    const created = await productModuleService.createProductOptions(
      plan.creates.map((opt) => ({ title: opt.title, values: opt.values, is_exclusive: true })) as any
    )
    for (const opt of Array.isArray(created) ? created : [created]) {
      optionIdByTitle.set(opt.title, opt.id)
    }
  }

  return optionIdByTitle
}
