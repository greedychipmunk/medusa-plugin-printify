import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../../modules/printify"
import { PrintifyOrderStatus } from "../../../../../../modules/printify/models/printify-order"
import { logger } from "../../../../../../modules/printify/utils/logger"

const apiLogger = logger.child("AdminOrderSubmitAPI")

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const orderId = req.params.id
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    if (!orderId) {
      res.status(400).json({ success: false, error: "Order ID is required", message: "Order ID parameter is missing" })
      return
    }

    apiLogger.info("Submitting order to Printify", { orderId })

    const order = await printifyService.getOrderBridge(orderId)

    if (order.status !== PrintifyOrderStatus.VALIDATED && order.status !== PrintifyOrderStatus.PENDING) {
      res.status(400).json({
        success: false,
        error: "Invalid order status",
        message: "Order must be validated or pending before it can be submitted",
      })
      return
    }

    const storeId = req.auth_context?.actor_id || "default-store"
    const apiClient = await printifyService.getApiClientForStore(storeId)
    const result = await printifyService.submitPrintifyOrder(orderId, apiClient)

    res.json({
      success: true,
      message: "Order submitted successfully",
      data: {
        order: {
          id: result.id,
          printify_order_id: result.printifyOrderId,
          status: result.status,
          tracking: result.tracking,
          submitted_at: result.submittedAt,
        },
      },
    })
  } catch (error) {
    apiLogger.error("Failed to submit order", error as Error)

    if ((error as any)?.code === "ENTITY_NOT_FOUND") {
      res.status(404).json({ success: false, error: "Order not found", message: `Order with ID ${req.params.id} does not exist` })
      return
    }

    res.status(500).json({ success: false, error: "Internal server error", message: "Failed to submit order" })
  }
}
