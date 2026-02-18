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

const orderStatusValues = ["pending", "validated", "submitted", "processing", "shipped", "delivered", "cancelled", "failed"] as const

const listOrdersQuerySchema = z.object({
  status: z.union([
    z.enum(orderStatusValues),
    z.array(z.enum(orderStatusValues)),
  ]).optional(),
  customer_id: z.string().optional(),
  date_from: z.string().datetime({ offset: true }).optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  date_to: z.string().datetime({ offset: true }).optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  limit: z.string().transform((v) => parseInt(v, 10)).pipe(z.number().int().min(1).max(100)).default("20"),
  offset: z.string().transform((v) => parseInt(v, 10)).pipe(z.number().int().min(0)).default("0"),
  sort_by: z.enum(["createdAt", "updatedAt", "status"]).default("createdAt"),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
})

const apiLogger = logger.child("AdminOrderAPI")

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const queryValidation = listOrdersQuerySchema.safeParse(req.query)
    if (!queryValidation.success) {
      res.status(400).json({
        success: false,
        error: "Validation error",
        message: "Invalid query parameters",
        details: queryValidation.error.issues,
      })
      return
    }

    const query = queryValidation.data

    const options: OrderListOptions = {
      limit: query.limit,
      offset: query.offset,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
    }

    if (query.status) {
      const statusArray = Array.isArray(query.status) ? query.status : [query.status]
      options.status = statusArray as PrintifyOrderStatus[]
    }
    if (query.customer_id) {
      options.customerId = query.customer_id
    }
    if (query.date_from) {
      options.dateFrom = new Date(query.date_from)
    }
    if (query.date_to) {
      options.dateTo = new Date(query.date_to)
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
        offset: query.offset,
        limit: query.limit,
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
