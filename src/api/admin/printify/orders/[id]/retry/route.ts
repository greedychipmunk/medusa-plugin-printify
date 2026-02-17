import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../../modules/printify"
import { PrintifyOrderStatus } from "../../../../../../modules/printify/models/printify-order"
import { logger } from "../../../../../../modules/printify/utils/logger"

const apiLogger = logger.child("AdminOrderRetryAPI")

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const orderId = req.params.id
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    if (!orderId) {
      res.status(400).json({ success: false, error: "Order ID is required", message: "Order ID parameter is missing" })
      return
    }

    apiLogger.info("Retrying failed order", { orderId })

    const order = await printifyService.getOrderBridge(orderId)

    if (order.status !== PrintifyOrderStatus.FAILED) {
      res.status(400).json({
        success: false,
        error: "Invalid order status",
        message: "Only orders in FAILED status can be retried",
      })
      return
    }

    await printifyService.updatePrintifyOrders([{
      id: orderId,
      status: PrintifyOrderStatus.PENDING,
      retry_count: 0,
      error_details: null,
      last_error_at: null,
    }])

    res.json({
      success: true,
      message: "Order reset for retry",
      data: {
        order: {
          id: orderId,
          status: PrintifyOrderStatus.PENDING,
          retry_count: 0,
          error_details: null,
          last_error_at: null,
        },
      },
    })
  } catch (error) {
    apiLogger.error("Failed to retry order", error as Error)

    if ((error as any)?.code === "ENTITY_NOT_FOUND") {
      res.status(404).json({ success: false, error: "Order not found", message: `Order with ID ${req.params.id} does not exist` })
      return
    }

    res.status(500).json({ success: false, error: "Internal server error", message: "Failed to retry order" })
  }
}
