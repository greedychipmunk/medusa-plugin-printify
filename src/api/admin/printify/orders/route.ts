import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import type PrintifyModuleService from "../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import { PrintifyOrderStatus } from "../../../../modules/printify/models/printify-order"
import { PrintifyCartItem } from "../../../../modules/printify/models/printify-cart-item"
import { logger } from "../../../../modules/printify/utils/logger"
import type { OrderListOptions } from "../../../../modules/printify/service"

const createOrderSchema = z.object({
  medusa_order_id: z.string().min(1, "Medusa order ID is required"),
  customer_id: z.string().optional(),
  customer_email: z.string().email("Valid customer email is required"),
  cart_items: z.array(z.object({
    id: z.string(),
    product_id: z.string(),
    variant_id: z.string(),
    printify_product_id: z.string(),
    printify_variant_id: z.string(),
    quantity: z.number().min(1),
    unit_price: z.number().min(0),
    options: z.record(z.any()).optional(),
  })).min(1, "At least one cart item is required"),
  shipping_address: z.object({
    first_name: z.string(),
    last_name: z.string(),
    email: z.string().email(),
    company: z.string().optional(),
    address1: z.string(),
    address2: z.string().optional(),
    city: z.string(),
    state: z.string().optional(),
    zip: z.string(),
    country: z.string(),
    phone: z.string().optional(),
  }),
  shipping_cost: z.number().min(0).optional(),
  tax_amount: z.number().min(0).optional(),
  discount_amount: z.number().min(0).optional(),
  shipping_method: z.number().int().positive().optional(),
})

const apiLogger = logger.child("AdminOrderAPI")

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const {
      status,
      customer_id,
      date_from,
      date_to,
      limit = 20,
      offset = 0,
      sort_by = "createdAt",
      sort_order = "desc",
    } = req.query

    const options: OrderListOptions = {
      limit: Number(limit),
      offset: Number(offset),
      sortBy: sort_by as "createdAt" | "updatedAt" | "status",
      sortOrder: sort_order as "asc" | "desc",
    }

    if (status) {
      const statusArray = Array.isArray(status) ? status : [status]
      options.status = statusArray.map((s) => s as PrintifyOrderStatus)
    }
    if (customer_id) {
      options.customerId = customer_id as string
    }
    if (date_from) {
      options.dateFrom = new Date(date_from as string)
    }
    if (date_to) {
      options.dateTo = new Date(date_to as string)
    }

    const result = await printifyService.listOrdersFiltered(options)

    res.json({
      success: true,
      data: {
        orders: result.orders.map((order) => ({
          id: order.id,
          medusa_order_id: order.medusaOrderId,
          printify_order_id: order.printifyOrderId,
          status: order.status,
          customer_id: order.customerId,
          customer_email: order.customerEmail,
          total_amount: order.pricing.total,
          currency: order.pricing.currency,
          created_at: order.createdAt,
          updated_at: order.updatedAt,
          shipping_address: order.shippingAddress,
          tracking: order.tracking,
          error_details: order.entity?.error_details ?? null,
          retry_count: order.retryCount,
          last_error_at: order.entity?.last_error_at ?? null,
        })),
        count: result.total,
        offset: Number(offset),
        limit: Number(limit),
        has_more: result.hasMore,
      },
    })
  } catch (error) {
    apiLogger.error("Failed to list orders", error as Error)
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to retrieve orders",
    })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const validationResult = createOrderSchema.safeParse(req.body)
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Validation failed",
        message: "Invalid request data",
        details: validationResult.error.errors,
      })
      return
    }

    const data = validationResult.data

    const cartItems = data.cart_items.map(
      (item) =>
        new PrintifyCartItem({
          id: item.id,
          cartId: "admin-created",
          productId: item.product_id,
          variantId: item.variant_id,
          printifyProductId: item.printify_product_id,
          printifyVariantId: item.printify_variant_id,
          quantity: item.quantity,
          options: item.options || {},
          pricing: {
            unitPrice: item.unit_price,
            totalPrice: item.unit_price * item.quantity,
            currency: "USD",
          },
        }),
    )

    const order = await printifyService.createOrderFromCart({
      medusaOrderId: data.medusa_order_id,
      customerId: data.customer_id,
      customerEmail: data.customer_email,
      cartItems,
      shippingAddress: {
        first_name: data.shipping_address.first_name,
        last_name: data.shipping_address.last_name,
        email: data.shipping_address.email,
        phone: data.shipping_address.phone,
        company: data.shipping_address.company,
        address1: data.shipping_address.address1,
        address2: data.shipping_address.address2,
        city: data.shipping_address.city,
        region: data.shipping_address.state || data.shipping_address.country,
        zip: data.shipping_address.zip,
        country: data.shipping_address.country,
      },
      shippingCost: data.shipping_cost,
      taxAmount: data.tax_amount,
      discountAmount: data.discount_amount,
      shippingMethod: data.shipping_method,
    })

    res.status(201).json({
      success: true,
      data: {
        order: {
          id: order.id,
          medusa_order_id: order.medusaOrderId,
          status: order.status,
          customer_email: order.customerEmail,
          total_amount: order.pricing.total,
          currency: order.pricing.currency,
          created_at: order.createdAt,
          updated_at: order.updatedAt,
        },
      },
    })
  } catch (error) {
    apiLogger.error("Failed to create order", error as Error)
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to create order",
    })
  }
}
