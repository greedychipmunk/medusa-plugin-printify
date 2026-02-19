import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { logger } from "../../../../../modules/printify/utils/logger"

const apiLogger = logger.child("StoreOrderTrackingAPI")

const trackOrderSchema = z.object({
  email: z.string().email(),
  order_id: z.string().min(1),
})

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const validation = trackOrderSchema.safeParse(req.body)
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: "Validation failed",
        details: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      })
      return
    }

    const { email, order_id } = validation.data

    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
    const order = await printifyService.getOrderByMedusaIdForCustomer(order_id, email)

    if (!order) {
      res.status(404).json({
        success: false,
        error: "Order not found",
      })
      return
    }

    res.json({
      data: {
        order: {
          id: order.id,
          medusa_order_id: order.medusaOrderId,
          status: order.status,
          items: (order.items || []).map((item: any) => ({
            title: item.title,
            quantity: item.quantity,
          })),
          shipping_address: order.shippingAddress
            ? {
                first_name: order.shippingAddress.first_name,
                city: order.shippingAddress.city,
                country: order.shippingAddress.country,
              }
            : null,
          tracking: order.tracking || null,
          created_at: order.createdAt,
          updated_at: order.updatedAt,
        },
      },
    })
  } catch (error) {
    apiLogger.error("Unexpected error tracking order", error as Error)
    res.status(500).json({
      success: false,
      error: "Internal server error",
    })
  }
}
