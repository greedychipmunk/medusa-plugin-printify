import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PrintifyProductService } from '../../../../../modules/printify/services/printify-product-service';
import { PrintifyApiClient } from '../../../../../modules/printify/services/printify-api-client';
import { logger } from '../../../../../modules/printify/utils/logger';

// Initialize services
const getProductService = (): PrintifyProductService => {
  const apiClient = new PrintifyApiClient({
    apiKey: process.env.PRINTIFY_API_KEY || 'dummy-key',
    shopId: process.env.PRINTIFY_SHOP_ID || 'dummy-shop',
  });
  const configurationId = 'default-config'; // This should come from configuration service
  return new PrintifyProductService(apiClient, configurationId);
};

const apiLogger = logger.child('AdminProductSyncAPI');

/**
 * POST /admin/printify/products/sync
 * Sync all products from Printify
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || 'default-store';
    
    apiLogger.info('Starting product sync from Printify', { storeId });

    const productService = getProductService();
    
    // Start the synchronization process
    const result = await productService.syncProducts();

    res.json({
      success: true,
      message: 'Product sync completed successfully',
      data: {
        sync_summary: {
          products_synced: result.synced_count || 0,
          products_failed: result.failed_count || 0,
          products_skipped: result.skipped_count || 0,
          sync_log_id: result.sync_log_id,
        },
      },
    });
  } catch (error) {
    apiLogger.error('Failed to sync products', error as Error);

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to sync products from Printify',
    });
  }
}