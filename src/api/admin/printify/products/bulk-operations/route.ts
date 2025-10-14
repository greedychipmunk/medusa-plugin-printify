import { Request, Response } from 'express';
import { z } from 'zod';
import { PrintifyProductService } from '../../../../../modules/printify/services/printify-product-service';
import { PrintifyConfigurationService } from '../../../../../modules/printify/services/printify-configuration-service';
import { PrintifyApiClient } from '../../../../../modules/printify/services/printify-api-client';
import { logger } from '../../../../../modules/printify/utils/logger';
import { PrintifyPluginError, ErrorCode, ErrorSeverity } from '../../../../../modules/printify/utils/error-handling';

// Extend Express Request to include user context
interface AdminRequest extends Request {
  user?: {
    id: string;
    email: string;
    store_id?: string;
  };
}

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
    apiKey: config.getApiKey(),
    shopId: config.printify_shop_id,
  });
  return new PrintifyProductService(apiClient, config.id);
}

const apiLogger = logger;

// Request body validation schemas
const bulkEnableSchema = z.object({
  product_ids: z.array(z.string()).min(1).max(100), // Limit to 100 products per batch
  reason: z.string().min(1).max(500).optional(),
});

const bulkDisableSchema = z.object({
  product_ids: z.array(z.string()).min(1).max(100), // Limit to 100 products per batch
  reason: z.string().min(1).max(500).optional(),
});

/**
 * POST /admin/printify/products/bulk-enable
 * Enable multiple products for storefront display
 */
export async function bulkEnable(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    const userId = req.user?.id || 'system';
    
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
      message: 'Bulk enable operation completed',
      data: {
        requested_count: product_ids.length,
        successful_count: result.success_count,
        failed_count: result.failure_count,
        failures: result.failures,
        bulk_operation_id: result.bulk_operation_id,
        completed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    apiLogger.error('Failed to bulk enable products', error as Error, {
      storeId: req.user?.store_id,
      userId: req.user?.id,
    });

    if (error instanceof PrintifyPluginError) {
      res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to enable products',
    });
  }
}

/**
 * POST /admin/printify/products/bulk-disable
 * Disable multiple products from storefront display
 */
export async function bulkDisable(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    const userId = req.user?.id || 'system';
    
    apiLogger.info('Bulk disabling products', { storeId, userId });

    // Validate request body
    const bodyValidation = bulkDisableSchema.safeParse(req.body);
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

    // Bulk disable products
    const result = await productService.bulkDisableProducts(product_ids, userId, reason);

    apiLogger.info('Bulk disable completed', { 
      storeId, 
      userId,
      productCount: product_ids.length,
      successCount: result.success_count,
      failureCount: result.failure_count
    });

    res.status(200).json({
      success: true,
      message: 'Bulk disable operation completed',
      data: {
        requested_count: product_ids.length,
        successful_count: result.success_count,
        failed_count: result.failure_count,
        failures: result.failures,
        bulk_operation_id: result.bulk_operation_id,
        completed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    apiLogger.error('Failed to bulk disable products', error as Error, {
      storeId: req.user?.store_id,
      userId: req.user?.id,
    });

    if (error instanceof PrintifyPluginError) {
      res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to disable products',
    });
  }
}