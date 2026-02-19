import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { logger } from "../../../../../modules/printify/utils/logger"
import { PrintifyPluginError, ErrorCode } from "../../../../../modules/printify/utils/error-handling"

const apiLogger = logger

const bulkSubmitSchema = z.object({
  order_ids: z.array(z.string()).min(1).max(100),
})

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const bodyValidation = bulkSubmitSchema.safeParse(req.body)
    if (!bodyValidation.success) {
      res.status(400).json({ success: false, error: "Validation error", message: "Invalid request body", details: bodyValidation.error.issues })
      return
    }

    const { order_ids } = bodyValidation.data

    // Get API client from first available configuration
    const [config] = await printifyService.listPrintifyConfigurations({})
    if (!config) {
      res.status(400).json({ success: false, error: "No configuration found", message: "Printify configuration is required" })
      return
    }

    const apiClient = await printifyService.getApiClientForConfig(config.id)
    const result = await printifyService.bulkSubmitOrders(order_ids, apiClient)

    res.status(200).json({
      success: true,
      message: `Bulk submit completed: ${result.success_count} successful, ${result.failure_count} failed`,
      data: {
        success_count: result.success_count,
        failure_count: result.failure_count,
        failed_orders: result.failed_orders,
      },
    })
  } catch (error) {
    apiLogger.error("Failed to bulk submit orders", error as Error)

    if (error instanceof PrintifyPluginError) {
      const statusCode = error.code === ErrorCode.ENTITY_NOT_FOUND ? 404 : 400
      res.status(statusCode).json({ success: false, error: error.code, message: error.message })
      return
    }

    res.status(500).json({ success: false, error: "Internal server error", message: "Failed to bulk submit orders" })
  }
}
