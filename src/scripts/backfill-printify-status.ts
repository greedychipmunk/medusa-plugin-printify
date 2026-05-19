/**
 * One-time reconciliation: ensure each linked Medusa product's status matches
 * the corresponding printify_product.is_published flag. Idempotent — safe to
 * re-run.
 *
 * Run via the Medusa application:
 *   pnpm medusa exec ./node_modules/medusa-plugin-printify/dist/scripts/backfill-printify-status.js
 *
 * The exported reconcileMedusaStatus helper is the pure logic; the default
 * export is the Medusa exec entrypoint.
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { IProductModuleService } from "@medusajs/types"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"

export type ProductStatus = "draft" | "proposed" | "published" | "rejected"

/**
 * Pure reconciliation logic. Returns the target Medusa status, or null if no
 * change is needed (or the current status is not one we manage).
 */
export function reconcileMedusaStatus(
  printifyProduct: { is_published: boolean },
  medusaStatus: ProductStatus
): ProductStatus | null {
  if (medusaStatus !== "published" && medusaStatus !== "draft") {
    return null
  }
  const want: ProductStatus = printifyProduct.is_published ? "published" : "draft"
  return want === medusaStatus ? null : want
}

export default async function backfillPrintifyStatus({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModuleService = container.resolve<IProductModuleService>(Modules.PRODUCT)

  const printifyProducts = await service.listPrintifyProducts({})
  logger.info(`[backfill] scanning ${printifyProducts.length} printify_product rows`)

  let drafted = 0
  let published = 0
  let unchanged = 0
  let unlinked = 0

  for (const pp of printifyProducts) {
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
      { is_published: pp.is_published },
      linked.status as ProductStatus
    )
    if (target === null) {
      unchanged++
      continue
    }
    await productModuleService.updateProducts(linked.id, { status: target as any })
    if (target === "draft") {
      drafted++
      logger.info(
        `[backfill] drafted Medusa product ${linked.id} (printify_id=${pp.printify_id}, "${pp.title}")`
      )
    } else {
      published++
      logger.info(
        `[backfill] published Medusa product ${linked.id} (printify_id=${pp.printify_id}, "${pp.title}")`
      )
    }
  }

  logger.info(
    `[backfill] summary: drafted=${drafted} published=${published} unchanged=${unchanged} unlinked=${unlinked}`
  )
}
