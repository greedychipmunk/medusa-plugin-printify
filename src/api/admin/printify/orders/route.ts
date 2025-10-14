import { Request, Response } from 'express';
import { z } from 'zod';
import { PrintifyOrderService, OrderListOptions } from '../../../../modules/printify/services/printify-order-service';
import { PrintifyOrderStatus } from '../../../../modules/printify/models/printify-order';
import { PrintifyCartItem } from '../../../../modules/printify/models/printify-cart-item';
import { PrintifyApiClient } from '../../../../modules/printify/services/printify-api-client';
import { StorefrontProductService } from '../../../../modules/printify/services/storefront-product-service';
import { logger } from '../../../../modules/printify/utils/logger';

// Extended Request type for Medusa admin context
interface AdminRequest extends Request {
  user?: {
    store_id?: string;
    id: string;
    email: string;
  };
}

// Request validation schemas
const createOrderSchema = z.object({
  medusa_order_id: z.string().min(1, 'Medusa order ID is required'),
  customer_id: z.string().optional(),
  customer_email: z.string().email('Valid customer email is required'),
  cart_items: z.array(z.object({
    id: z.string(),
    product_id: z.string(),
    variant_id: z.string(),
    printify_product_id: z.string(),
    printify_variant_id: z.string(),
    quantity: z.number().min(1),
    unit_price: z.number().min(0),
    options: z.record(z.any()).optional(),
  })).min(1, 'At least one cart item is required'),
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
});

// Initialize services (in a real app, these would be injected from DI container)
const getOrderService = (): PrintifyOrderService => {
  const apiClient = new PrintifyApiClient({
    apiKey: process.env.PRINTIFY_API_KEY || 'dummy-key',
    shopId: process.env.PRINTIFY_SHOP_ID || 'dummy-shop',
  });
  const storefrontService = new StorefrontProductService(apiClient);
  return new PrintifyOrderService(apiClient, storefrontService);
};
const apiLogger = logger.child('AdminOrderAPI');

/**
 * GET /admin/printify/orders
 * List all Printify orders with filtering options
 */
export async function GET(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    
    apiLogger.info('Listing orders', { storeId, query: req.query });

    // Parse query parameters
    const {
      status,
      customer_id,
      date_from,
      date_to,
      limit = 20,
      offset = 0,
      sort_by = 'createdAt',
      sort_order = 'desc',
    } = req.query;

    // Build options
    const options: OrderListOptions = {
      limit: Number(limit),
      offset: Number(offset),
      sortBy: sort_by as 'createdAt' | 'updatedAt' | 'status',
      sortOrder: sort_order as 'asc' | 'desc',
    };

    // Add status filter if provided
    if (status) {
      const statusArray = Array.isArray(status) ? status : [status];
      options.status = statusArray.map(s => s as PrintifyOrderStatus);
    }

    // Add customer filter if provided
    if (customer_id) {
      options.customerId = customer_id as string;
    }

    // Add date filters if provided
    if (date_from) {
      options.dateFrom = new Date(date_from as string);
    }
    if (date_to) {
      options.dateTo = new Date(date_to as string);
    }

    const orderService = getOrderService();
    const result = await orderService.listOrders(options);

    res.json({
      success: true,
      data: {
        orders: result.orders.map(order => ({
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
          last_error: order.lastError,
          retry_count: order.retryCount,
        })),
        count: result.total,
        offset: Number(offset),
        limit: Number(limit),
        has_more: result.hasMore,
      },
    });
  } catch (error) {
    apiLogger.error('Failed to list orders', error as Error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to retrieve orders',
    });
  }
}

/**
 * POST /admin/printify/orders
 * Create a new Printify order from cart data
 */
export async function POST(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    
    apiLogger.info('Creating order', { storeId });

    // Validate request body
    const validationResult = createOrderSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
      return;
    }

    const data = validationResult.data;

    // Convert request cart items to PrintifyCartItem instances
    const cartItems = data.cart_items.map(item => new PrintifyCartItem({
      id: item.id,
      cartId: 'admin-created',
      productId: item.product_id,
      variantId: item.variant_id,
      printifyProductId: item.printify_product_id,
      printifyVariantId: item.printify_variant_id,
      quantity: item.quantity,
      options: item.options || {},
      pricing: {
        unitPrice: item.unit_price,
        totalPrice: item.unit_price * item.quantity,
        currency: 'USD',
      },
    }));

    const orderService = getOrderService();
    const order = await orderService.createOrder({
      medusaOrderId: data.medusa_order_id,
      customerId: data.customer_id,
      customerEmail: data.customer_email,
      cartItems: cartItems,
      shippingAddress: {
        firstName: data.shipping_address.first_name,
        lastName: data.shipping_address.last_name,
        email: data.shipping_address.email,
        phone: data.shipping_address.phone,
        company: data.shipping_address.company,
        address1: data.shipping_address.address1,
        address2: data.shipping_address.address2,
        city: data.shipping_address.city,
        state: data.shipping_address.state,
        zip: data.shipping_address.zip,
        country: data.shipping_address.country,
      },
      shippingCost: data.shipping_cost,
      taxAmount: data.tax_amount,
      discountAmount: data.discount_amount,
    });

    apiLogger.info('Order created successfully', { orderId: order.id });

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
    });
  } catch (error) {
    apiLogger.error('Failed to create order', error as Error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to create order',
    });
  }
}