import { MedusaContainer } from "@medusajs/framework/types"
import { PRINTIFY_MODULE } from "../modules/printify"
import type PrintifyModuleService from "../modules/printify/service"
import { automationActivityStore } from "../modules/printify/utils/automation-activity"
import { syncPrintifyProductsWorkflow } from "../workflows/sync-printify-products"

export default async function syncPrintifyProductsJob(container: MedusaContainer) {
  const logger = container.resolve("logger") as any
  const printifyService: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)

  logger.info("Scheduled job: sync-printify-products starting")

  try {
    const [configs] = await printifyService.listAndCountPrintifyConfigurations({
      filters: { sync_enabled: true },
    })

    if (!configs || configs.length === 0) {
      logger.info("No configurations with sync_enabled, skipping")
      return
    }

    for (const config of configs) {
      const activity = automationActivityStore.get(config.id)

      // Skip if already running
      if (activity.product_sync.last_sync_status === "running") {
        logger.info("Sync already running, skipping", { configId: config.id })
        continue
      }

      // Check sync_frequency: skip if last sync was too recent
      const syncFrequencyMs = (config.sync_frequency || 60) * 60 * 1000
      if (activity.product_sync.last_sync_at) {
        const elapsed = Date.now() - new Date(activity.product_sync.last_sync_at).getTime()
        if (elapsed < syncFrequencyMs) {
          logger.info("Sync frequency not elapsed, skipping", {
            configId: config.id,
            elapsedMs: elapsed,
            frequencyMs: syncFrequencyMs,
          })
          continue
        }
      }

      const startTime = Date.now()
      automationActivityStore.updateProductSync(config.id, {
        last_sync_status: "running",
        error_message: undefined,
      })

      try {
        const { result } = await syncPrintifyProductsWorkflow(container).run({
          input: {
            config_id: config.id,
            force: false,
          },
        })

        const duration = Date.now() - startTime
        automationActivityStore.updateProductSync(config.id, {
          last_sync_at: new Date(),
          last_sync_status: "success",
          last_sync_duration_ms: duration,
          products_synced: result.synced_count,
          products_failed: result.failed_count,
          error_message: undefined,
        })

        logger.info("Product sync completed", {
          configId: config.id,
          synced: result.synced_count,
          failed: result.failed_count,
          durationMs: duration,
        })
      } catch (error) {
        const duration = Date.now() - startTime
        automationActivityStore.updateProductSync(config.id, {
          last_sync_at: new Date(),
          last_sync_status: "failed",
          last_sync_duration_ms: duration,
          error_message: (error as Error).message,
        })

        logger.error("Product sync failed", {
          configId: config.id,
          error: (error as Error).message,
        })
      }
    }
  } catch (error) {
    logger.error("sync-printify-products job failed", {
      error: (error as Error).message,
    })
  }
}

export const config = {
  name: "sync-printify-products",
  schedule: "*/5 * * * *",
}
