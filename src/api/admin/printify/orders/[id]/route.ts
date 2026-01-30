import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from 'zod';
import { PrintifyOrderService } from '../../../../../modules/printify/services/printify-order-service';
import { PrintifyOrderStatus } from '../../../../../modules/printify/models/printify-order';
import { PrintifyApiClient } from '../../../../../modules/printify/services/printify-api-client';
import { StorefrontProductService } from '../../../../../modules/printify/services/storefront-product-service';
import { logger } from '../../../../../modules/printify/utils/logger';

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
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || 'default-store';
    const orderId = req.params.id;
        if (!orderId) {
      res.status(400).json({
        success: false,
        error: 'Order ID is required',
        message: 'Order ID parameter is missing',
      });
      return;
    }
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
          retry_count: 0, // TODO: Add retry_count field to DML model
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
export async function PATCH(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || 'default-store';
    const orderId = req.params.id;
        if (!orderId) {
      res.status(400).json({
        success: false,
        error: 'Order ID is required',
        message: 'Order ID parameter is missing',
      });
      return;
    }
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