/**
 * Explicitly complete pending custom-integration publication requests.
 * Unlike general visibility repair, this script performs the publish handshake:
 * private prepare -> acknowledge external id/handle -> confirmed refresh.
 * See docs/2026-10-10_printify-publication-gate.md. No merchandise is deleted.
 *
 * Run via the Medusa application:
 *   pnpm medusa exec ./node_modules/medusa-plugin-printify/dist/scripts/reconcile-publishing.js
 */
import { ExecArgs, IProductModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { syncProductsWorkflow } from "../workflows/sync-products"
import { isPrintifyPublished, isPrintifyPublishing } from "../workflows/visibility"

export default async function reconcilePublishing({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const products = container.resolve<IProductModuleService>(Modules.PRODUCT)
  const client = service.getApiClient()
  const options = service.getOptions()
  const { shopId } = options
  if (!shopId) {
    logger.warn("[reconcile-publishing] no shopId configured, skipping")
    return
  }

  const firstPage = await client.getProducts(shopId, 1, 50)
  const allProducts = [...firstPage.data]
  for (let page = 2; page <= (firstPage.last_page ?? 1); page++) {
    allProducts.push(...(await client.getProducts(shopId, page, 50)).data)
  }
  // Only explicit, known pending publications are candidates. Never use local
  // contaminated flags or acknowledge every product merely to repair visibility.
  const locked = allProducts.filter(isPrintifyPublishing)
  let succeeded = 0
  let failed = 0
  let refreshFailed = 0
  let skipped = 0

  for (const p of locked) {
    const printifyProductId = String(p.id)
    let stage = "prepare"
    let pending = false
    let acknowledged = false
    const context = () => ({ stage, printify_id: printifyProductId, shop_id: shopId, acknowledged })
    const draft = async () => {
      const { data } = await query.graph({
        entity: "printify_product", fields: ["product.id"],
        filters: { printify_id: printifyProductId },
      })
      for (const row of data) {
        if (row.product?.id) await products.updateProducts(row.product.id, { status: "draft" })
      }
    }
    try {
      logger.info(`[reconcile-publishing] ${JSON.stringify(context())}`)
      await syncProductsWorkflow(container).run({ input: { shopId } })
      stage = "verify_pending"
      const current = await client.getProduct(shopId, printifyProductId)
      await service.updatePrintifyProducts({
        selector: { printify_id: printifyProductId },
        data: {
          is_published: isPrintifyPublished(current),
          is_locked: current?.is_locked !== false,
          printify_data: current && typeof current === "object" && !Array.isArray(current)
            ? current as unknown as Record<string, unknown> : null,
        },
      })
      pending = isPrintifyPublishing(current)
      if (isPrintifyPublished(current)) {
        skipped++
        continue
      }
      if (!pending) throw new Error("Printify request is neither pending nor positively completed")
      stage = "link"
      const { data } = await query.graph({
        entity: "printify_product", fields: ["product.id", "product.handle"],
        filters: { printify_id: printifyProductId },
      })
      const linked = data[0]?.product
      if (!linked?.id || !linked?.handle) throw new Error("no linked Medusa product with a handle after private preparation")
      await draft()
      const base = (options.storefrontBaseUrl ?? options.webhookBaseUrl ?? "").replace(/\/+$/, "")
      const handle = `${base}/products/${linked.handle}`
      stage = "acknowledge"
      await client.setPublishSucceeded(shopId, printifyProductId, { id: linked.id, handle })
      acknowledged = true
      succeeded++
      stage = "confirmed_refresh"
      const confirmed = await client.getProduct(shopId, printifyProductId)
      await service.updatePrintifyProducts({
        selector: { printify_id: printifyProductId },
        data: {
          is_published: isPrintifyPublished(confirmed),
          is_locked: confirmed?.is_locked !== false,
          printify_data: confirmed && typeof confirmed === "object" && !Array.isArray(confirmed)
            ? confirmed as unknown as Record<string, unknown> : null,
        },
      })
      if (!isPrintifyPublished(confirmed)) {
        throw new Error("Printify publication completion is not yet confirmed")
      }
      await syncProductsWorkflow(container).run({ input: { shopId } })
      logger.info(`[reconcile-publishing] ${JSON.stringify({ ...context(), handle })}`)
    } catch (err) {
      if (acknowledged) refreshFailed++
      else failed++
      const reason = err instanceof Error ? err.message : String(err)
      logger.error(`[reconcile-publishing] ${JSON.stringify({ ...context(), error: reason })}`)
      try {
        await draft()
      } catch (draftErr) {
        logger.error(`[reconcile-publishing] ${JSON.stringify({ ...context(), stage: "demote", error: String(draftErr) })}`)
      }
      if (pending && !acknowledged) {
        try {
          await client.setPublishFailed(shopId, printifyProductId, reason)
        } catch (failErr) {
          logger.error(`[reconcile-publishing] ${JSON.stringify({ ...context(), stage: "report_failure", error: String(failErr) })}`)
        }
      }
    }
  }
  logger.info(`[reconcile-publishing] summary: succeeded=${succeeded} failed=${failed} refresh_failed=${refreshFailed} skipped=${skipped}`)
  if (failed + refreshFailed > 0) throw new Error("Publication reconciliation incomplete; review stage logs and rerun")
}
