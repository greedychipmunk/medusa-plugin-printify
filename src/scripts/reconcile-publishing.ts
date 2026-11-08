/**
 * Explicitly complete pending custom-integration publication requests
 * (products locked in Printify). The same reconciliation runs every 10 minutes
 * as the `printify-reconcile-publishing` job; this script runs it on demand.
 * See docs/2026-11-08_publish-handshake-hidden-products.md. No merchandise is deleted.
 *
 * Run via the Medusa application:
 *   pnpm medusa exec ./node_modules/medusa-plugin-printify/dist/scripts/reconcile-publishing.js
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { reconcileLockedPublications } from "../lib/reconcile-locked-publications"

export default async function reconcilePublishing({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const { shopId } = service.getOptions()
  if (!shopId) {
    logger.warn("[reconcile-publishing] no shopId configured, skipping")
    return
  }
  const summary = await reconcileLockedPublications(
    container,
    shopId,
    (level, line) => (level === "error" ? logger.error(line) : logger.info(line)),
    "[reconcile-publishing]"
  )
  logger.info(
    `[reconcile-publishing] summary: succeeded=${summary.succeeded} failed=${summary.failed} ` +
    `refresh_failed=${summary.refresh_failed} skipped=${summary.skipped}`
  )
  if (summary.failed + summary.refresh_failed > 0) {
    throw new Error("Publication reconciliation incomplete; review stage logs and rerun")
  }
}
