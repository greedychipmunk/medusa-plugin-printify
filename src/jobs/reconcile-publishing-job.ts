import { MedusaContainer } from "@medusajs/framework/types"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { reconcileLockedPublications } from "../lib/reconcile-locked-publications"

/**
 * Safety net for the custom-integration publish handshake. Any product still
 * locked in Printify (a publish request we have not answered: lost webhook,
 * restart, API blip) is completed here, well inside Printify's one-hour
 * auto-unlock. Normally finds nothing. Per-product failures are logged and
 * retried next run. See docs/2026-11-08_publish-handshake-hidden-products.md.
 */
export default async function reconcilePublishingJob(container: MedusaContainer) {
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const { shopId } = service.getOptions()
  if (!shopId) {
    console.warn("[printify] reconcile-publishing-job: no shopId configured, skipping")
    return
  }
  const summary = await reconcileLockedPublications(container, shopId)
  if (summary.locked > 0) {
    console.log(`[printify] reconcile-publishing-job: ${JSON.stringify(summary)}`)
  }
}

export const config = {
  name: "printify-reconcile-publishing",
  schedule: "*/10 * * * *",
}
