import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from 'zod';
import { PrintifyProductService } from '../../../../../modules/printify/services/printify-product-service';
import { PrintifyConfigurationService } from '../../../../../modules/printify/services/printify-configuration-service';
import { PrintifyApiClient } from '../../../../../modules/printify/services/printify-api-client';
import { logger } from '../../../../../modules/printify/utils/logger';
import { PrintifyPluginError, ErrorCode, ErrorSeverity } from '../../../../../modules/printify/utils/error-handling';

// Dynamic service creation helper
async function getProductService(storeId: string): Promise<PrintifyProductService> {
  const configService = new PrintifyConfigurationService();
  const config = await configService.getConfiguration(storeId);
  
  if (!config) {
    throw new PrintifyPluginError(
      ErrorCode.ENTITY_NOT_FOUND, 
      'Configuration not found for store', 
      ErrorSeverity.MEDIUM,
      { storeId }
    );
  }

  const apiClient = new PrintifyApiClient({
    apiKey: config.printify_api_key,
    shopId: config.printify_shop_id,
  });
  return new PrintifyProductService(apiClient, config.id);
}

const apiLogger = logger;

// Request body validation schema
const bulkEnableSchema = z.object({
  product_ids: z.array(z.string()).min(1).max(100),
  reason: z.string().min(1).max(500).optional(),
});

/**
 * POST /admin/printify/products/bulk-enable
 * Enable multiple products for storefront display
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || 'default-store';
    const userId = req.auth_context?.actor_id || 'system';
    
    apiLogger.info('Bulk enabling products', { storeId, userId });

    // Validate request body
    const bodyValidation = bulkEnableSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Invalid request body',
        details: bodyValidation.error.issues,
      });
      return;
    }

    const { product_ids, reason } = bodyValidation.data;

    // Get product service instance for this store
    const productService = await getProductService(storeId);

    // Bulk enable products
    const result = await productService.bulkEnableProducts(product_ids, userId, reason);

    apiLogger.info('Bulk enable completed', { 
      storeId, 
      userId,
      productCount: product_ids.length,
      successCount: result.success_count,
      failureCount: result.failure_count
    });

    res.status(200).json({
      success: true,
      message: `Bulk enable completed: ${result.success_count} successful, ${result.failure_count} failed`,
      data: {
        success_count: result.success_count,
        failure_count: result.failure_count,
        successful_products: [], // Service doesn't return successful_products property
        failed_products: result.failures,
      },
    });
  } catch (error) {
    apiLogger.error('Failed to bulk enable products', error as Error, {
      storeId: req.auth_context?.actor_id,
      userId: req.auth_context?.actor_id,
    });

    if (error instanceof PrintifyPluginError) {
      const statusCode = error.code === ErrorCode.ENTITY_NOT_FOUND ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        error: error.code,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to bulk enable products',
    });
  }
}