/**
 * One-time reconciliation for products stuck in Printify's "Publishing"
 * state. For custom_integration shops, Printify locks a product on publish
 * and waits for the integration to acknowledge via publishing_succeeded /
 * publishing_failed. Before this plugin completed that handshake, products
 * stayed locked forever. This script finds locked products, syncs them into
 * Medusa, and completes the handshake.
 *
 * Idempotent — safe to re-run. Products already unlocked are skipped.
 *
 * Run via the Medusa application:
 *   pnpm medusa exec ./node_modules/medusa-plugin-printify/dist/scripts/reconcile-publishing.js
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { IProductModuleService } from "@medusajs/types"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { syncProductsWorkflow } from "../workflows/sync-products"

export default async function reconcilePublishing({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const client = service.getApiClient()
  const options = service.getOptions()

  const { shopId } = options
  if (!shopId) {
    logger.warn("[reconcile-publishing] no shopId configured, skipping")
    return
  }

  // Sync first so printify_product rows (and linked Medusa products) reflect
  // current Printify state — the sync now treats locked+visible as published.
  logger.info("[reconcile-publishing] syncing products before reconciliation")
  await syncProductsWorkflow(container).run({ input: { shopId } })

  const products = await client.getProducts(shopId, 1, 50)
  const allProducts = [...products.data]
  for (let page = 2; page <= (products.last_page ?? 1); page++) {
    const next = await client.getProducts(shopId, page, 50)
    allProducts.push(...next.data)
  }

  const locked = allProducts.filter((p) => p.is_locked && p.visible)
  logger.info(
    `[reconcile-publishing] ${allProducts.length} products total, ${locked.length} locked (mid-publish)`
  )

  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (const p of locked) {
    const printifyProductId = String(p.id)
    try {
      const { data } = await query.graph({
        entity: "printify_product",
        fields: ["product.id", "product.handle"],
        filters: { printify_id: printifyProductId },
      })
      const medusaProduct = data[0]?.product
      if (!medusaProduct?.id || !medusaProduct?.handle) {
        throw new Error("no linked Medusa product after sync")
      }

      const base = (options.storefrontBaseUrl ?? options.webhookBaseUrl ?? "")
        .replace(/\/+$/, "")
      const handle = `${base}/products/${medusaProduct.handle}`

      await client.setPublishSucceeded(shopId, printifyProductId, {
        id: medusaProduct.id,
        handle,
      })
      succeeded++
      logger.info(`[reconcile-publishing] unlocked "${p.title}" → ${handle}`)
    } catch (err) {
      failed++
      const reason = err instanceof Error ? err.message : String(err)
      logger.error(`[reconcile-publishing] failed to unlock "${p.title}": ${reason}`)
      try {
        await client.setPublishFailed(shopId, printifyProductId, reason)
      } catch (failErr) {
        logger.error(
          `[reconcile-publishing] also failed to report failure to Printify: ${failErr}`
        )
      }
    }
  }

  logger.info(
    `[reconcile-publishing] summary: succeeded=${succeeded} failed=${failed} skipped=${skipped}`
  )
}
