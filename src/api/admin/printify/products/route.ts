/**
 * Admin Products API Routes
 * 
 * Handles product listing and management for the Printify plugin including
 * pagination, filtering, and search functionality.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { PrintifyProductService } from '../../../../modules/printify/services/printify-product-service';
import { PrintifyConfigurationService } from '../../../../modules/printify/services/printify-configuration-service';
import { PrintifyApiClient } from '../../../../modules/printify/services/printify-api-client';
import { PrintifyProduct } from '../../../../modules/printify/models/printify-product';
import { logger } from '../../../../modules/printify/utils/logger';
import { PrintifyPluginError, ErrorCode, ErrorSeverity } from '../../../../modules/printify/utils/error-handling';

// Extended Request type for Medusa admin context
interface AdminRequest extends Request {
  user?: {
    store_id?: string;
    id: string;
    email: string;
  };
}

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
    apiKey: config.getApiKey(),
    shopId: config.printify_shop_id,
  });
  return new PrintifyProductService(apiClient, config.id);
}

const apiLogger = logger;

/**
 * GET /admin/printify/products
 * List all Printify products with pagination and filtering
 */
export async function listProducts(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    
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
        products: result.products.map((product: PrintifyProduct) => ({
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

/**
 * GET /admin/printify/products/:id
 * Get specific product details
 */
export async function getProduct(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    const productId = req.params.id;
    
    if (!productId) {
      res.status(400).json({
        success: false,
        error: 'Missing product ID',
        message: 'Product ID is required',
      });
      return;
    }
    
    apiLogger.info('Getting product details', { storeId, productId });

    // Get product service instance for this store
    const productService = await getProductService(storeId);
    const product = await productService.getProduct(productId);

    if (!product) {
      res.status(404).json({
        success: false,
        error: 'Product not found',
        message: 'The requested product does not exist',
      });
      return;
    }

    apiLogger.info('Product details retrieved', { storeId, productId });

    res.status(200).json({
      success: true,
      data: {
        id: product.id,
        printify_product_id: product.printify_product_id,
        medusa_product_id: product.medusa_product_id,
        configuration_id: product.configuration_id,
        title: product.title,
        description: product.description,
        enabled: product.enabled,
        variants: product.getVariants(),
        images: product.getImages(),
        base_price: product.getBasePrice(),
        is_available: product.isAvailable(),
        needs_sync: product.needsSync(),
        printify_data: product.printify_data,
        last_sync_at: product.last_sync_at,
        created_at: product.created_at,
        updated_at: product.updated_at,
      },
    });
  } catch (error) {
    apiLogger.error('Failed to get product', error as Error, { 
      storeId: req.user?.store_id,
      productId: req.params.id 
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
      message: 'Failed to retrieve product',
    });
  }
}

/**
 * POST /admin/printify/products/sync
 * Trigger product synchronization from Printify
 */
export async function syncProducts(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    const userId = req.user?.id || 'system';
    
    apiLogger.info('Starting product synchronization', { storeId, userId });

    // Get product service instance for this store
    const productService = await getProductService(storeId);

    // Start async sync operation
    const syncPromise = productService.syncProducts({ force: true });
    
    // Don't wait for completion - return immediately with sync started status
    res.status(202).json({
      success: true,
      message: 'Product synchronization started',
      data: {
        status: 'sync_started',
        started_at: new Date().toISOString(),
      },
    });

    // Let sync complete in background
    syncPromise.catch((error: Error) => {
      apiLogger.error('Background sync failed', error, { storeId, userId });
    });

  } catch (error) {
    apiLogger.error('Failed to start product sync', error as Error, { 
      storeId: req.user?.store_id 
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
      message: 'Failed to start synchronization',
    });
  }
}

/**
 * GET /admin/printify/products/stats
 * Get product statistics for dashboard
 */
export async function getProductStats(req: AdminRequest, res: Response): Promise<void> {
  try {
    const storeId = req.user?.store_id || 'default-store';
    
    apiLogger.info('Getting product statistics', { storeId });

    // Get product service instance for this store
    const productService = await getProductService(storeId);

    // Get basic stats (in real implementation, this would be more efficient)
    const allProducts = await productService.getProducts({ 
      page: 1, 
      limit: 1000 // Get large batch for stats
    });

    const stats = {
      total_products: allProducts.total,
      enabled_products: allProducts.products.filter((p: PrintifyProduct) => p.enabled).length,
      disabled_products: allProducts.products.filter((p: PrintifyProduct) => !p.enabled).length,
      needs_sync: allProducts.products.filter((p: PrintifyProduct) => p.needsSync()).length,
      linked_to_medusa: allProducts.products.filter((p: PrintifyProduct) => p.medusa_product_id).length,
      available_products: allProducts.products.filter((p: PrintifyProduct) => p.isAvailable()).length,
    };

    apiLogger.info('Product statistics calculated', { storeId, stats });

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    apiLogger.error('Failed to get product stats', error as Error, { 
      storeId: req.user?.store_id 
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to retrieve statistics',
    });
  }
}

// Route handlers mapping
export const productRoutes = {
  GET: listProducts,
  POST: syncProducts,
};

export const productDetailRoutes = {
  GET: getProduct,
};

export const productStatsRoutes = {
  GET: getProductStats,
};