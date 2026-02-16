import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { logger } from "../../../../../modules/printify/utils/logger"
import { PrintifyPluginError, ErrorCode } from "../../../../../modules/printify/utils/error-handling"

const apiLogger = logger

const bulkDisableSchema = z.object({
  product_ids: z.array(z.string()).min(1).max(100),
  reason: z.string().min(1).max(500).optional(),
})

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const userId = req.auth_context?.actor_id || "system"
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const bodyValidation = bulkDisableSchema.safeParse(req.body)
    if (!bodyValidation.success) {
      res.status(400).json({ success: false, error: "Validation error", message: "Invalid request body", details: bodyValidation.error.issues })
      return
    }

    const { product_ids, reason } = bodyValidation.data
    const result = await printifyService.bulkDisableProducts(product_ids, userId, reason)

    res.status(200).json({
      success: true,
      message: `Bulk disable completed: ${result.success_count} successful, ${result.failure_count} failed`,
      data: {
        success_count: result.success_count,
        failure_count: result.failure_count,
        successful_products: [],
        failed_products: result.failures,
      },
    })
  } catch (error) {
    apiLogger.error("Failed to bulk disable products", error as Error)

    if (error instanceof PrintifyPluginError) {
      const statusCode = error.code === ErrorCode.ENTITY_NOT_FOUND ? 404 : 400
      res.status(statusCode).json({ success: false, error: error.code, message: error.message })
      return
    }

    res.status(500).json({ success: false, error: "Internal server error", message: "Failed to bulk disable products" })
  }
}
