import { Request, Response } from 'express';
import { z } from 'zod';
import { PrintifyOrderService } from '../../../../../modules/printify/services/printify-order-service';
import { PrintifyOrderStatus } from '../../../../../modules/printify/models/printify-order';
import { PrintifyApiClient } from '../../../../../modules/printify/services/printify-api-client';
import { StorefrontProductService } from '../../../../../modules/printify/services/storefront-product-service';
import { logger } from '../../../../../modules/printify/utils/logger';

// Extended Request type for Medusa admin context
interface AdminRequest extends Request {
  user?: {
    store_id?: string;
    id: string;
    email: string;
  };
  params: {
    id: string;
  };
}

// Request validation schemas
const updateOrderSchema = z.object({
  status: z.enum(['pending', 'validated', 'submitted', 'processing', 'shipped', 'delivered', 'cancelled', 'failed']).optional(),
  notes: z.string().optional(),
});

const cancelOrderSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required'),
});

// Initialize services
const getOrderService = (): PrintifyOrderService => {
  const apiClient = new PrintifyApiClient({
    apiKey: process.env.PRINTIFY_API_KEY || 'dummy-key',
    shopId: process.env.PRINTIFY_SHOP_ID || 'dummy-shop',
  });
  const storefrontService = new StorefrontProductService(apiClient);
  return new PrintifyOrderService(apiClient, storefrontService);
};

const apiLogger = logger.child('AdminOrderDetailAPI');

/**
 * GET /admin/printify/orders/:id
 * Get details of a specific Printify order
 */
export async function GET(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    const orderId = req.params.id;
    
    apiLogger.info('Getting order details', { storeId, orderId });

    const orderService = getOrderService();
    const order = await orderService.getOrder(orderId);

    if (!order) {
      res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Order with ID ${orderId} does not exist`,
      });
      return;
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
          items: order.items.map((item: any) => ({
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
          retry_count: order.retryCount,
        },
      },
    });
  } catch (error) {
    apiLogger.error('Failed to get order details', error as Error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to retrieve order details',
    });
  }
}

/**
 * PATCH /admin/printify/orders/:id
 * Update order status or notes
 */
export async function PATCH(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    const orderId = req.params.id;
    
    apiLogger.info('Updating order', { storeId, orderId });

    // Validate request body
    const validationResult = updateOrderSchema.safeParse(req.body);
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
    const orderService = getOrderService();

    // Get current order
    const order = await orderService.getOrder(orderId);
    if (!order) {
      res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Order with ID ${orderId} does not exist`,
      });
      return;
    }

    // Update status if provided
    if (data.status) {
      await orderService.updateOrderStatus(orderId, {
        status: data.status as PrintifyOrderStatus,
        note: data.notes,
      });
    }

    // Get updated order
    const updatedOrder = await orderService.getOrder(orderId);

    apiLogger.info('Order updated successfully', { orderId });

    res.json({
      success: true,
      data: {
        order: {
          id: updatedOrder!.id,
          medusa_order_id: updatedOrder!.medusaOrderId,
          status: updatedOrder!.status,
          updated_at: updatedOrder!.updatedAt,
        },
      },
    });
  } catch (error) {
    apiLogger.error('Failed to update order', error as Error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to update order',
    });
  }
}

/**
 * POST /admin/printify/orders/:id/submit
 * Submit order to Printify for production
 */
export async function submit(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    const orderId = req.params.id;
    
    apiLogger.info('Submitting order to Printify', { storeId, orderId });

    const orderService = getOrderService();
    
    // Check if order exists
    const order = await orderService.getOrder(orderId);
    if (!order) {
      res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Order with ID ${orderId} does not exist`,
      });
      return;
    }

    // Check if order can be submitted
    if (order.status !== PrintifyOrderStatus.VALIDATED) {
      res.status(400).json({
        success: false,
        error: 'Invalid order status',
        message: `Order must be in VALIDATED status to submit. Current status: ${order.status}`,
      });
      return;
    }

    // Submit to Printify
    const result = await orderService.submitOrder(orderId);

    apiLogger.info('Order submitted successfully', { orderId, printifyOrderId: result.printifyOrderId });

    res.json({
      success: true,
      data: {
        order: {
          id: result.id,
          printify_order_id: result.printifyOrderId,
          status: result.status,
          submitted_at: result.submittedAt,
        },
      },
    });
  } catch (error) {
    apiLogger.error('Failed to submit order', error as Error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to submit order to Printify',
    });
  }
}

/**
 * POST /admin/printify/orders/:id/cancel
 * Cancel a Printify order
 */
export async function cancel(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    const orderId = req.params.id;
    
    apiLogger.info('Cancelling order', { storeId, orderId });

    // Validate request body
    const validationResult = cancelOrderSchema.safeParse(req.body);
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
    const orderService = getOrderService();
    
    // Check if order exists
    const order = await orderService.getOrder(orderId);
    if (!order) {
      res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Order with ID ${orderId} does not exist`,
      });
      return;
    }

    // Cancel order
    const result = await orderService.cancelOrder(orderId, data.reason);

    apiLogger.info('Order cancelled successfully', { orderId });

    res.json({
      success: true,
      data: {
        order: {
          id: result.id,
          status: result.status,
          cancelled_at: result.updatedAt,
          cancellation_reason: data.reason,
        },
      },
    });
  } catch (error) {
    apiLogger.error('Failed to cancel order', error as Error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to cancel order',
    });
  }
}

/**
 * POST /admin/printify/orders/:id/sync
 * Sync order status with Printify
 */
export async function sync(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    const orderId = req.params.id;
    
    apiLogger.info('Syncing order status', { storeId, orderId });

    const orderService = getOrderService();
    
    // Check if order exists
    const order = await orderService.getOrder(orderId);
    if (!order) {
      res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Order with ID ${orderId} does not exist`,
      });
      return;
    }

    // Sync with Printify
    const result = await orderService.syncOrderStatus(orderId);

    apiLogger.info('Order status synced successfully', { orderId, newStatus: result.status });

    res.json({
      success: true,
      data: {
        order: {
          id: result.id,
          status: result.status,
          tracking: result.tracking,
          updated_at: result.updatedAt,
        },
      },
    });
  } catch (error) {
    apiLogger.error('Failed to sync order status', error as Error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to sync order status',
    });
  }
}