/**
 * Repair storefront visibility from FRESH Printify facts, never legacy local
 * publication booleans. Does not complete pending publish requests or delete
 * merchandise. See docs/2026-10-10_printify-publication-gate.md.
 *
 * Run via the Medusa application:
 *   pnpm medusa exec ./node_modules/medusa-plugin-printify/.medusa/server/src/scripts/backfill-printify-status.js
 */
import { ExecArgs, IProductModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { computeEffectiveVisibility, isPrintifyPublished } from "../workflows/visibility"

export type ProductStatus = "draft" | "proposed" | "published" | "rejected"

export function reconcileMedusaStatus(
  printifyProduct: {
    is_published?: unknown
    is_locked?: unknown
    visibility_override?: boolean | null
    printify_data?: unknown
  },
  medusaStatus: ProductStatus
): ProductStatus | null {
  if (medusaStatus !== "published" && medusaStatus !== "draft") return null
  const want = computeEffectiveVisibility({
    is_published: printifyProduct.is_published === true,
    is_locked: printifyProduct.is_locked !== false,
    visibility_override: printifyProduct.visibility_override,
    printify_data: printifyProduct.printify_data,
  })
  return want === medusaStatus ? null : want
}

export default async function backfillPrintifyStatus({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const products = container.resolve<IProductModuleService>(Modules.PRODUCT)
  const client = service.getApiClient()
  const printifyProducts = await service.listPrintifyProducts({})
  let drafted = 0
  let published = 0
  let unchanged = 0
  let unlinked = 0
  let failed = 0

  for (const pp of printifyProducts) {
    let stage = "read_upstream"
    const context = () => ({ stage, printify_id: pp.printify_id, shop_id: pp.shop_id })
    // Unknown/unreadable facts fail closed. Never fall back to pp.is_published.
    let facts: { is_published: boolean; is_locked: boolean; printify_data: Record<string, unknown> | null } = {
      is_published: false, is_locked: true, printify_data: null,
    }
    try {
      if (!pp.shop_id) throw new Error("no shop id for upstream verification")
      const remote = await client.getProduct(pp.shop_id, pp.printify_id)
      facts = {
        is_published: isPrintifyPublished(remote),
        is_locked: remote?.is_locked !== false,
        printify_data: remote && typeof remote === "object" && !Array.isArray(remote)
          ? remote as unknown as Record<string, unknown> : null,
      }
      stage = "persist_facts"
      await service.updatePrintifyProducts({ selector: { id: pp.id }, data: facts })
    } catch (err) {
      failed++
      facts = { is_published: false, is_locked: true, printify_data: null }
      logger.error(`[backfill] ${JSON.stringify({ ...context(), error: String(err) })}`)
    }

    try {
      stage = "resolve_link"
      const { data } = await query.graph({
        entity: "printify_product",
        fields: ["product.id", "product.status"],
        filters: { id: pp.id },
      })
      const linked = data[0]?.product
      if (!linked?.id) {
        unlinked++
        continue
      }
      const target = reconcileMedusaStatus(
        { ...facts, visibility_override: pp.visibility_override },
        linked.status as ProductStatus
      )
      if (target === null) {
        unchanged++
        continue
      }
      stage = "apply_visibility"
      await products.updateProducts(linked.id, { status: target })
      if (target === "draft") drafted++
      else published++
      logger.info(`[backfill] ${JSON.stringify({ ...context(), product_id: linked.id, status: target })}`)
    } catch (err) {
      failed++
      logger.error(`[backfill] ${JSON.stringify({ ...context(), error: String(err) })}`)
    }
  }
  logger.info(`[backfill] summary: drafted=${drafted} published=${published} unchanged=${unchanged} unlinked=${unlinked} failed=${failed}`)
  if (failed > 0) throw new Error(`[backfill] ${failed} repair operation(s) failed; review logs and rerun`)
}
