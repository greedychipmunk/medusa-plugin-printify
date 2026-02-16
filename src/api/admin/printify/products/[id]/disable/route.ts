import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import type PrintifyModuleService from "../../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../../modules/printify"
import { logger } from "../../../../../../modules/printify/utils/logger"
import { PrintifyPluginError, ErrorCode } from "../../../../../../modules/printify/utils/error-handling"

const apiLogger = logger

const disableProductSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
})

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const productId = req.params.id
    const userId = req.auth_context?.actor_id || "system"
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    if (!productId) {
      res.status(400).json({ success: false, error: "Missing product ID", message: "Product ID is required" })
      return
    }

    const bodyValidation = disableProductSchema.safeParse(req.body)
    if (!bodyValidation.success) {
      res.status(400).json({ success: false, error: "Validation error", message: "Invalid request body", details: bodyValidation.error.issues })
      return
    }

    const { reason } = bodyValidation.data
    const product = await printifyService.disableProduct(productId, userId, reason)

    res.status(200).json({
      success: true,
      message: "Product disabled successfully",
      data: {
        id: product?.id,
        printify_product_id: product?.printify_product_id,
        title: product?.title,
        enabled: product?.enabled,
        updated_at: product?.updated_at,
        medusa_product: null,
        medusa_product_unlinked: true,
      },
    })
  } catch (error) {
    apiLogger.error("Failed to disable product", error as Error)

    if (error instanceof PrintifyPluginError) {
      const statusCode = error.code === ErrorCode.ENTITY_NOT_FOUND ? 404 : 400
      res.status(statusCode).json({ success: false, error: error.code, message: error.message })
      return
    }

    res.status(500).json({ success: false, error: "Internal server error", message: "Failed to disable product" })
  }
}
