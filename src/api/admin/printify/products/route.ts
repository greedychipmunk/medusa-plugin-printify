/**
 * Admin Products API Routes
 * 
 * Handles product listing and management for the Printify plugin including
 * pagination, filtering, and search functionality.
 */

import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from 'zod';
import { PrintifyProductService } from '../../../../modules/printify/services/printify-product-service';
import { PrintifyConfigurationService } from '../../../../modules/printify/services/printify-configuration-service';
import { PrintifyApiClient } from '../../../../modules/printify/services/printify-api-client';
import PrintifyProduct from '../../../../modules/printify/models/printify-product';
import { logger } from '../../../../modules/printify/utils/logger';
import { PrintifyPluginError, ErrorCode, ErrorSeverity } from '../../../../modules/printify/utils/error-handling';

// Query parameter validation schema
const listProductsQuerySchema = z.object({
  page: z.string().transform(val => parseInt(val, 10)).default('1'),
  limit: z.string().transform(val => parseInt(val, 10)).default('20'),
  enabled: z.enum(['true', 'false']).optional().transform(val => val ? val === 'true' : undefined),
  search: z.string().optional(),
  sort: z.enum(['title', 'created_at', 'updated_at', 'last_sync_at']).default('updated_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

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

/**
 * GET /admin/printify/products
 * List all Printify products with pagination and filtering
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || 'default-store';
    
    apiLogger.info('Listing products', { storeId });

    // Validate query parameters
    const queryValidation = listProductsQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Invalid query parameters',
        details: queryValidation.error.issues,
      });
      return;
    }

    const query = queryValidation.data;

    // Get product service instance for this store
    const productService = await getProductService(storeId);

    // Get products with pagination and filtering
    const result = await productService.getProducts({
      page: query.page,
      limit: Math.min(query.limit, 100), // Cap at 100 items per page
      enabled: query.enabled,
      search: query.search,
      sort: query.sort,
      order: query.order,
    });

    apiLogger.info('Products listed successfully', { 
      storeId, 
      total: result.total,
      page: query.page,
      limit: query.limit 
    });

    res.status(200).json({
      success: true,
      data: {
        products: result.products.map((product: any) => ({
          id: product.id,
          printify_product_id: product.printify_product_id,
          medusa_product_id: product.medusa_product_id,
          title: product.title,
          description: product.description,
          enabled: product.enabled,
          base_price: product.getBasePrice(),
          is_available: product.isAvailable(),
          variant_count: product.getVariants().length,
          image_count: product.getImages().length,
          needs_sync: product.needsSync(),
          last_sync_at: product.last_sync_at,
          created_at: product.created_at,
          updated_at: product.updated_at,
        })),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          total_pages: Math.ceil(result.total / result.limit),
          has_more: result.page * result.limit < result.total,
        },
        filters: {
          enabled: query.enabled,
          search: query.search,
          sort: query.sort,
          order: query.order,
        },
      },
    });
  } catch (error) {
    apiLogger.error('Failed to list products', error as Error, { storeId: req.user?.store_id });

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
      message: 'Failed to retrieve products',
    });
  }
}

