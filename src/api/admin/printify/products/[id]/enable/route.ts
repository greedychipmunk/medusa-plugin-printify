import { Request, Response } from 'express';
import { z } from 'zod';
import { PrintifyProductService } from '../../../../../../modules/printify/services/printify-product-service';
import { PrintifyConfigurationService } from '../../../../../../modules/printify/services/printify-configuration-service';
import { PrintifyApiClient } from '../../../../../../modules/printify/services/printify-api-client';
import { logger } from '../../../../../../modules/printify/utils/logger';
import { PrintifyPluginError, ErrorCode, ErrorSeverity } from '../../../../../../modules/printify/utils/error-handling';

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

// Request body validation schema
const enableProductSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

/**
 * POST /admin/printify/products/:id/enable
 * Enable a single product for storefront display
 */
export async function POST(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    const productId = req.params.id;
    const userId = req.user?.id || 'system';
    
    if (!productId) {
      res.status(400).json({
        success: false,
        error: 'Missing product ID',
        message: 'Product ID is required',
      });
      return;
    }
    
    apiLogger.info('Enabling product', { storeId, productId, userId });

    // Validate request body
    const bodyValidation = enableProductSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Invalid request body',
        details: bodyValidation.error.issues,
      });
      return;
    }

    const { reason } = bodyValidation.data;

    // Get product service instance for this store
    const productService = await getProductService(storeId);

    // Enable the product
    const product = await productService.enableProduct(productId, userId, reason);

    apiLogger.info('Product enabled successfully', { 
      storeId, 
      productId, 
      userId,
      reason 
    });

    res.status(200).json({
      success: true,
      message: 'Product enabled successfully',
      data: {
        id: product.id,
        printify_product_id: product.printify_product_id,
        title: product.title,
        enabled: product.enabled,
        updated_at: product.updated_at,
      },
    });
  } catch (error) {
    apiLogger.error('Failed to enable product', error as Error, {
      storeId: req.user?.store_id,
      productId: req.params.id,
      userId: req.user?.id,
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
      message: 'Failed to enable product',
    });
  }
}