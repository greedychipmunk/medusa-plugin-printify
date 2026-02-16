import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { PrintifyOrderStatus } from "../../../../../modules/printify/models/printify-order"
import { logger } from "../../../../../modules/printify/utils/logger"

const updateOrderSchema = z.object({
  status: z.enum(["pending", "validated", "submitted", "processing", "shipped", "delivered", "cancelled", "failed"]).optional(),
  notes: z.string().optional(),
})

const apiLogger = logger.child("AdminOrderDetailAPI")

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const orderId = req.params.id
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    if (!orderId) {
      res.status(400).json({ success: false, error: "Order ID is required", message: "Order ID parameter is missing" })
      return
    }

    const order = await printifyService.getOrderBridge(orderId)

    // Fetch linked Medusa order data if available
    let medusaOrder: any = null
    try {
      const enriched = await printifyService.getOrderWithMedusaData(orderId)
      if (enriched?.order) {
        medusaOrder = {
          id: enriched.order.id,
          display_id: enriched.order.display_id,
          status: enriched.order.status,
          email: enriched.order.email,
        }
      }
    } catch {
      // Non-fatal: linked data may not be available
    }

    res.json({
      success: true,
      data: {
        order: {
          id: order.id,
          medusa_order_id: order.medusaOrderId,
          printify_order_id: order.printifyOrderId,
          status: order.status,
          customer_id: order.customerId,
          customer_email: order.customerEmail,
          items: order.items?.map((item: any) => ({
            product_id: item.productId,
            variant_id: item.variantId,
            printify_product_id: item.printifyProductId,
            printify_variant_id: item.printifyVariantId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
            options: item.options,
          })),
          pricing: {
            subtotal: order.pricing.subtotal,
            shipping_cost: order.pricing.shippingCost,
            tax_amount: order.pricing.taxAmount,
            discount_amount: order.pricing.discountAmount,
            total: order.pricing.total,
            currency: order.pricing.currency,
          },
          shipping_address: order.shippingAddress,
          tracking: order.tracking,
          created_at: order.createdAt,
          updated_at: order.updatedAt,
          submitted_at: order.submittedAt,
          last_error: order.lastError,
          retry_count: 0,
          medusa_order: medusaOrder,
        },
      },
    })
  } catch (error) {
    apiLogger.error("Failed to get order details", error as Error)

    if ((error as any)?.code === "ENTITY_NOT_FOUND") {
      res.status(404).json({ success: false, error: "Order not found", message: `Order with ID ${req.params.id} does not exist` })
      return
    }

    res.status(500).json({ success: false, error: "Internal server error", message: "Failed to retrieve order details" })
  }
}

export async function PATCH(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const orderId = req.params.id
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    if (!orderId) {
      res.status(400).json({ success: false, error: "Order ID is required", message: "Order ID parameter is missing" })
      return
    }

    const validationResult = updateOrderSchema.safeParse(req.body)
    if (!validationResult.success) {
      res.status(400).json({ success: false, error: "Validation failed", message: "Invalid request data", details: validationResult.error.errors })
      return
    }

    const data = validationResult.data

    if (data.status) {
      await printifyService.updateOrderStatus(orderId, {
        status: data.status as PrintifyOrderStatus,
        note: data.notes,
      })
    }

    const updatedOrder = await printifyService.getOrderBridge(orderId)

    res.json({
      success: true,
      data: {
        order: {
          id: updatedOrder.id,
          medusa_order_id: updatedOrder.medusaOrderId,
          status: updatedOrder.status,
          updated_at: updatedOrder.updatedAt,
        },
      },
    })
  } catch (error) {
    apiLogger.error("Failed to update order", error as Error)
    res.status(500).json({ success: false, error: "Internal server error", message: "Failed to update order" })
  }
}
