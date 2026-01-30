import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PrintifyOrderService } from '../../../../../modules/printify/services/printify-order-service';
import { PrintifyApiClient } from '../../../../../modules/printify/services/printify-api-client';
import { StorefrontProductService } from '../../../../../modules/printify/services/storefront-product-service';
import { logger } from '../../../../../modules/printify/utils/logger';

// Initialize services
const getOrderService = (): PrintifyOrderService => {
  const apiClient = new PrintifyApiClient({
    apiKey: process.env.PRINTIFY_API_KEY || 'dummy-key',
    shopId: process.env.PRINTIFY_SHOP_ID || 'dummy-shop',
  });
  const storefrontService = new StorefrontProductService(apiClient);
  return new PrintifyOrderService(apiClient, storefrontService);
};

const apiLogger = logger.child('AdminOrderStatsAPI');

/**
 * GET /admin/printify/orders/stats
 * Get order statistics and analytics
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || 'default-store';
    
    apiLogger.info('Getting order statistics', { storeId });

    // Parse query parameters for date range
    const {
      date_from,
      date_to,
    } = req.query;

    const orderService = getOrderService();
    
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (date_from) {
      dateFrom = new Date(date_from as string);
    }
    if (date_to) {
      dateTo = new Date(date_to as string);
    }

    const stats = await orderService.getOrderStats();

    res.json({
      success: true,
      data: {
        stats: {
          total_orders: stats.total,
          pending_orders: stats.pending,
          processing_orders: stats.processing,
          shipped_orders: stats.shipped,
          delivered_orders: stats.delivered,
          cancelled_orders: stats.cancelled,
          failed_orders: stats.failed,
          total_value: stats.totalValue,
          average_processing_time_hours: stats.averageProcessingTime,
          currency: stats.currency,
          date_range: {
            from: dateFrom?.toISOString(),
            to: dateTo?.toISOString(),
          },
        },
      },
    });
  } catch (error) {
    apiLogger.error('Failed to get order statistics', error as Error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to retrieve order statistics',
    });
  }
}