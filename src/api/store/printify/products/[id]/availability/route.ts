import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../../modules/printify"
import { logger } from "../../../../../../modules/printify/utils/logger"
import { ErrorCode } from "../../../../../../modules/printify/utils/error-handling"

const apiLogger = logger.child("StoreVariantAvailabilityAPI")

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const { id } = req.params

    if (!id) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Product ID is required",
          type: "validation_error",
        },
      })
      return
    }

    const body = req.body as { variant_ids?: string[] } | undefined
    const variantIds = Array.isArray(body?.variant_ids) ? body.variant_ids : undefined

    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const result = await printifyService.getVariantAvailability(id, variantIds)

    res.json({
      product_id: id,
      variants: result.variants,
      cached: result.cached,
      fetched_at: result.fetched_at.toISOString(),
    })
  } catch (error: any) {
    if (error?.code === ErrorCode.ENTITY_NOT_FOUND) {
      res.status(404).json({
        error: {
          code: ErrorCode.ENTITY_NOT_FOUND,
          message: error.message || "Product not found",
          type: "not_found",
        },
      })
      return
    }

    apiLogger.error("Failed to fetch variant availability", error as Error)
    res.status(500).json({
      error: {
        code: ErrorCode.API_SERVER_ERROR,
        message: "Failed to fetch variant availability",
        type: "server_error",
      },
    })
  }
}
