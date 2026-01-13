import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PrintifyOrderService } from '../../../../../../modules/printify/services/printify-order-service';
import { PrintifyApiClient } from '../../../../../../modules/printify/services/printify-api-client';
import { StorefrontProductService } from '../../../../../../modules/printify/services/storefront-product-service';
import { logger } from '../../../../../../modules/printify/utils/logger';

// Initialize services
const getOrderService = (): PrintifyOrderService => {
  const apiClient = new PrintifyApiClient({
    apiKey: process.env.PRINTIFY_API_KEY || 'dummy-key',
    shopId: process.env.PRINTIFY_SHOP_ID || 'dummy-shop',
  });
  const storefrontService = new StorefrontProductService(apiClient);
  return new PrintifyOrderService(apiClient, storefrontService);
};

const apiLogger = logger.child('AdminOrderCancelAPI');

/**
 * POST /admin/printify/orders/:id/cancel
 * Cancel an order in Printify
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
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
    
    apiLogger.info('Cancelling order in Printify', { storeId, orderId });

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

    // Cancel the order
    const result = await orderService.cancelOrder(orderId);

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        order: {
          id: result.id,
          printify_order_id: result.printifyOrderId,
          status: result.status,
          cancelled_at: result.updatedAt,
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