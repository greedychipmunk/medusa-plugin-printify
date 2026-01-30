import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PrintifyOrderService } from '../../../../../../modules/printify/services/printify-order-service';
import { PrintifyOrderStatus } from '../../../../../../modules/printify/models/printify-order';
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

const apiLogger = logger.child('AdminOrderSubmitAPI');

/**
 * POST /admin/printify/orders/:id/submit
 * Submit order to Printify for production
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
        message: 'Order must be validated before it can be submitted',
      });
      return;
    }

    // Submit the order
    const result = await orderService.submitOrder(orderId);

    res.json({
      success: true,
      message: 'Order submitted successfully',
      data: {
        order: {
          id: result.id,
          printify_order_id: result.printifyOrderId,
          status: result.status,
          tracking: result.tracking,
          submitted_at: result.submittedAt,
        },
      },
    });
  } catch (error) {
    apiLogger.error('Failed to submit order', error as Error);

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to submit order',
    });
  }
}