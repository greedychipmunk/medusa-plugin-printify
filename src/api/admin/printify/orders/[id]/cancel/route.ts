import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../../modules/printify"
import { logger } from "../../../../../../modules/printify/utils/logger"

const apiLogger = logger.child("AdminOrderCancelAPI")

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const orderId = req.params.id
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    if (!orderId) {
      res.status(400).json({ success: false, error: "Order ID is required", message: "Order ID parameter is missing" })
      return
    }

    apiLogger.info("Cancelling order", { orderId })

    const storeId = req.auth_context?.actor_id || "default-store"
    const apiClient = await printifyService.getApiClientForStore(storeId)
    const result = await printifyService.cancelPrintifyOrder(orderId, apiClient)

    res.json({
      success: true,
      message: "Order cancelled successfully",
      data: {
        order: {
          id: result.id,
          printify_order_id: result.printifyOrderId,
          status: result.status,
          cancelled_at: result.updatedAt,
        },
      },
    })
  } catch (error) {
    apiLogger.error("Failed to cancel order", error as Error)

    if ((error as any)?.code === "ENTITY_NOT_FOUND") {
      res.status(404).json({ success: false, error: "Order not found", message: `Order with ID ${req.params.id} does not exist` })
      return
    }

    res.status(500).json({ success: false, error: "Internal server error", message: "Failed to cancel order" })
  }
}
