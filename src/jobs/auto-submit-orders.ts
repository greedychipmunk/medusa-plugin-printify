import { MedusaContainer } from "@medusajs/framework/types"
import { PRINTIFY_MODULE } from "../modules/printify"
import type PrintifyModuleService from "../modules/printify/service"
import { PrintifyOrderStatus } from "../modules/printify/models/printify-order"
import { automationActivityStore } from "../modules/printify/utils/automation-activity"
import { submitPrintifyOrderWorkflow } from "../workflows/submit-printify-order"

const MAX_RETRIES = 3

export default async function autoSubmitOrdersJob(container: MedusaContainer) {
  const logger = container.resolve("logger") as any
  const printifyService: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)

  logger.info("Scheduled job: auto-submit-orders starting")

  try {
    const [configs] = await printifyService.listAndCountPrintifyConfigurations({
      filters: { auto_submit_orders: true },
    })

    if (!configs || configs.length === 0) {
      logger.info("No configurations with auto_submit_orders, skipping")
      return
    }

    for (const config of configs) {
      const activity = automationActivityStore.get(config.id)

      // Skip if already running
      if (activity.order_auto_submit.last_run_status === "running") {
        logger.info("Auto-submit already running, skipping", { configId: config.id })
        continue
      }

      automationActivityStore.updateOrderAutoSubmit(config.id, {
        last_run_status: "running",
        error_message: undefined,
      })

      try {
        const { orders } = await printifyService.listOrdersFiltered({
          status: [PrintifyOrderStatus.PENDING],
        })

        // Filter orders belonging to this configuration
        const pendingOrders = orders.filter(
          (o: any) => (o.entity?.configuration_id || o.configuration_id) === config.id ||
            (o.entity?.configuration_id || o.configuration_id) === "default"
        )

        let submitted = 0
        let failed = 0
        let deadLettered = 0

        for (const order of pendingOrders) {
          try {
            await submitPrintifyOrderWorkflow(container).run({
              input: {
                order_id: order.id,
                store_id: config.store_id,
              },
            })
            submitted++

            // Reset retry_count on success if it was previously incremented
            const currentRetryCount = (order as any).entity?.retry_count ?? (order as any).retry_count ?? 0
            if (currentRetryCount > 0) {
              await printifyService.updatePrintifyOrders([{
                id: order.id,
                retry_count: 0,
                error_details: null,
                last_error_at: null,
              }])
            }
          } catch (error) {
            failed++
            const errorMessage = (error as Error).message
            const currentRetryCount = ((order as any).entity?.retry_count ?? (order as any).retry_count ?? 0) + 1

            if (currentRetryCount >= MAX_RETRIES) {
              // Dead-letter: move to FAILED status
              await printifyService.updatePrintifyOrders([{
                id: order.id,
                status: PrintifyOrderStatus.FAILED,
                retry_count: currentRetryCount,
                error_details: errorMessage,
                last_error_at: new Date(),
              }])
              deadLettered++
              logger.warn("Order dead-lettered after max retries", {
                orderId: order.id,
                retryCount: currentRetryCount,
                error: errorMessage,
              })
            } else {
              // Increment retry count and record error
              await printifyService.updatePrintifyOrders([{
                id: order.id,
                retry_count: currentRetryCount,
                error_details: errorMessage,
                last_error_at: new Date(),
              }])
              logger.warn("Failed to auto-submit order, will retry", {
                orderId: order.id,
                retryCount: currentRetryCount,
                maxRetries: MAX_RETRIES,
                error: errorMessage,
              })
            }
          }
        }

        automationActivityStore.updateOrderAutoSubmit(config.id, {
          last_run_at: new Date(),
          last_run_status: "success",
          orders_submitted: submitted,
          orders_failed: failed,
          orders_dead_lettered: deadLettered,
          error_message: undefined,
        })

        logger.info("Auto-submit orders completed", {
          configId: config.id,
          submitted,
          failed,
          deadLettered,
        })
      } catch (error) {
        automationActivityStore.updateOrderAutoSubmit(config.id, {
          last_run_at: new Date(),
          last_run_status: "failed",
          error_message: (error as Error).message,
        })

        logger.error("Auto-submit orders failed", {
          configId: config.id,
          error: (error as Error).message,
        })
      }
    }
  } catch (error) {
    logger.error("auto-submit-orders job failed", {
      error: (error as Error).message,
    })
  }
}

export const config = {
  name: "auto-submit-orders",
  schedule: "*/5 * * * *",
}
