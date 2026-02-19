import { MedusaContainer } from "@medusajs/framework/types"
import { PRINTIFY_MODULE } from "../modules/printify"
import type PrintifyModuleService from "../modules/printify/service"

export default async function cleanupWebhookEventsJob(container: MedusaContainer) {
  const logger = container.resolve("logger") as any
  const printifyService: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)

  logger.info("Scheduled job: cleanup-webhook-events starting")

  try {
    const [configs] = await printifyService.listAndCountPrintifyConfigurations({})

    if (!configs || configs.length === 0) {
      logger.info("No configurations found, skipping webhook cleanup")
      return
    }

    for (const config of configs) {
      try {
        const deleted = await printifyService.cleanupOldWebhookEvents(config.id)
        if (deleted > 0) {
          logger.info("Cleaned up old webhook events", {
            configId: config.id,
            deleted,
          })
        }
      } catch (error) {
        logger.error("Failed to clean up webhook events for config", {
          configId: config.id,
          error: (error as Error).message,
        })
      }
    }
  } catch (error) {
    logger.error("cleanup-webhook-events job failed", {
      error: (error as Error).message,
    })
  }
}

export const config = {
  name: "cleanup-webhook-events",
  schedule: "0 2 * * *",
}
