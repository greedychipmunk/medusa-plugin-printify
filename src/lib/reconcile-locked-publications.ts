import { MedusaContainer } from "@medusajs/framework/types"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { isPrintifyPublishing } from "../workflows/visibility"
import { HandshakeLog, PublishHandshakeError, runPublishHandshake } from "./publish-handshake"

export type ReconcileSummary = {
  locked: number
  succeeded: number
  skipped: number
  failed: number
  refresh_failed: number
}

/**
 * Complete every publish request Printify is still waiting on (locked
 * products). Only explicit, upstream-locked requests are candidates; never
 * acknowledge from local flags. Never throws per product.
 */
export async function reconcileLockedPublications(
  container: MedusaContainer,
  shopId: string,
  log?: HandshakeLog,
  tag = "[printify] reconcile-publishing"
): Promise<ReconcileSummary> {
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const client = service.getApiClient()
  const firstPage = await client.getProducts(shopId, 1, 50)
  const all = [...firstPage.data]
  for (let page = 2; page <= (firstPage.last_page ?? 1); page++) {
    all.push(...(await client.getProducts(shopId, page, 50)).data)
  }
  const locked = all.filter(isPrintifyPublishing)
  const summary: ReconcileSummary = { locked: locked.length, succeeded: 0, skipped: 0, failed: 0, refresh_failed: 0 }
  for (const product of locked) {
    try {
      const outcome = await runPublishHandshake(container, shopId, String(product.id), log, tag)
      if (outcome === "acknowledged") summary.succeeded++
      else summary.skipped++
    } catch (err) {
      if (err instanceof PublishHandshakeError && err.acknowledged) summary.refresh_failed++
      else summary.failed++
    }
  }
  return summary
}
