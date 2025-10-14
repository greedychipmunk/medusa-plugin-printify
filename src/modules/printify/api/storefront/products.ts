/**
 * Storefront Product Routes
 * 
 * Public API endpoints for customers to browse, search, and view products
 * from the Printify catalog. Simplified implementation for initial storefront support.
 */

import { Router, Request, Response } from 'express';
import { StorefrontProductService } from '../../services/storefront-product-service';
import { PrintifyApiClient } from '../../services/printify-api-client';
import { logger } from '../../utils/logger';
import { PrintifyPluginError, ErrorCode } from '../../utils/error-handling';

/**
 * Create storefront product routes
 */
export function createStorefrontProductRoutes(
  storefrontService: StorefrontProductService
): Router {
  const router = Router();

  /**
   * GET /store/printify/products
   * List products with filtering and pagination
   */
  router.get('/products', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const category = req.query.category as string;
      const search = req.query.search as string;
      const available = req.query.available === 'true';
      const sortBy = (req.query.sortBy as string) || 'created_at';
      const sortOrder = (req.query.sortOrder as string) || 'desc';
      const includeVariants = req.query.includeVariants === 'true';

      logger.info('Storefront products requested', {
        limit,
        offset,
        category,
        search,
        available,
        sortBy,
        sortOrder,
        includeVariants,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });

      const options = {
        filters: {
          category,
          search,
          available: available ? true : undefined,
        },
        sort: {
          field: sortBy as any,
          direction: sortOrder as any,
        },
        limit,
        offset,
        includeVariants,
      };

      const result = await storefrontService.getProducts(options);

      const response = {
        data: result.products.map(product => ({
          id: product.id,
          title: product.title,
          description: product.description,
          enabled: product.enabled,
          created_at: product.created_at,
          updated_at: product.updated_at,
          url: `/products/${product.id}`,
          shareUrl: `${req.protocol}://${req.get('host')}/products/${product.id}`,
        })),
        meta: {
          total: result.total,
          limit,
          offset,
          hasMore: result.hasMore,
          page: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil(result.total / limit),
        },
        filters: result.filters,
      };

      logger.info('Storefront products response', {
        count: response.data.length,
        total: response.meta.total,
        hasMore: response.meta.hasMore,
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to fetch storefront products', error as Error, {
        query: req.query,
        ip: req.ip,
      });

      res.status(500).json({
        error: {
          code: ErrorCode.API_SERVER_ERROR,
          message: 'Failed to fetch products',
          type: 'server_error',
        },
      });
    }
  });

  /**
   * GET /store/printify/products/search
   * Search products
   */
  router.get('/products/search', async (req: Request, res: Response): Promise<void> => {
    try {
      const q = req.query.q as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const includeVariants = req.query.includeVariants === 'true';

      if (!q || q.trim().length === 0) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Search query is required',
            type: 'validation_error',
          },
        });
        return;
      }

      logger.info('Product search requested', {
        searchTerm: q,
        limit,
        offset,
        includeVariants,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });

      const options = {
        limit,
        offset,
        includeVariants,
      };

      const result = await storefrontService.searchProducts(q, options);

      const response = {
        data: result.products.map(product => ({
          id: product.id,
          title: product.title,
          description: product.description,
          enabled: product.enabled,
          created_at: product.created_at,
          updated_at: product.updated_at,
          url: `/products/${product.id}`,
          shareUrl: `${req.protocol}://${req.get('host')}/products/${product.id}`,
        })),
        meta: {
          searchTerm: result.searchTerm,
          total: result.total,
          limit,
          offset,
          hasMore: result.hasMore,
          page: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil(result.total / limit),
        },
        suggestions: result.suggestions,
        filters: result.filters,
      };

      logger.info('Product search response', {
        searchTerm: q,
        count: response.data.length,
        total: response.meta.total,
        suggestionsCount: response.suggestions.length,
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to search products', error as Error, {
        query: req.query,
        ip: req.ip,
      });

      res.status(500).json({
        error: {
          code: ErrorCode.API_SERVER_ERROR,
          message: 'Failed to search products',
          type: 'server_error',
        },
      });
    }
  });

  /**
   * GET /store/printify/products/featured
   * Get featured products
   */
  router.get('/products/featured', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 8, 20);

      logger.info('Featured products requested', {
        limit,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });

      const products = await storefrontService.getFeaturedProducts(limit);

      const response = {
        data: products.map(product => ({
          id: product.id,
          title: product.title,
          description: product.description,
          enabled: product.enabled,
          created_at: product.created_at,
          updated_at: product.updated_at,
          url: `/products/${product.id}`,
          shareUrl: `${req.protocol}://${req.get('host')}/products/${product.id}`,
        })),
        meta: {
          count: products.length,
          limit,
        },
      };

      logger.info('Featured products response', {
        count: response.data.length,
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to fetch featured products', error as Error, {
        query: req.query,
        ip: req.ip,
      });

      res.status(500).json({
        error: {
          code: ErrorCode.API_SERVER_ERROR,
          message: 'Failed to fetch featured products',
          type: 'server_error',
        },
      });
    }
  });

  /**
   * GET /store/printify/products/:id
   * Get single product details
   */
  router.get('/products/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Product ID is required',
            type: 'validation_error',
          },
        });
        return;
      }
      
      const includeVariants = req.query.includeVariants !== 'false';

      logger.info('Product details requested', {
        productId: id,
        includeVariants,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });

      const product = await storefrontService.getProduct(id, includeVariants);

      if (!product) {
        logger.warn('Product not found for storefront', { productId: id });
        res.status(404).json({
          error: {
            code: ErrorCode.PRODUCT_NOT_FOUND,
            message: 'Product not found',
            type: 'not_found',
          },
        });
        return;
      }

      const response = {
        data: {
          id: product.id,
          title: product.title,
          description: product.description,
          enabled: product.enabled,
          created_at: product.created_at,
          updated_at: product.updated_at,
          url: `/products/${product.id}`,
          shareUrl: `${req.protocol}://${req.get('host')}/products/${product.id}`,
          breadcrumbs: [
            { name: 'Home', url: '/' },
            { name: 'Products', url: '/products' },
            { name: product.title, url: `/products/${product.id}` },
          ],
        },
      };

      logger.info('Product details response', {
        productId: id,
        title: product.title,
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to fetch product details', error as Error, {
        productId: req.params.id,
        ip: req.ip,
      });

      if (error instanceof PrintifyPluginError && error.code === ErrorCode.PRODUCT_NOT_FOUND) {
        res.status(404).json({
          error: {
            code: error.code,
            message: error.message,
            type: 'not_found',
          },
        });
      } else {
        res.status(500).json({
          error: {
            code: ErrorCode.API_SERVER_ERROR,
            message: 'Failed to fetch product details',
            type: 'server_error',
          },
        });
      }
    }
  });

  /**
   * GET /store/printify/products/:id/related
   * Get related products
   */
  router.get('/products/:id/related', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Product ID is required',
            type: 'validation_error',
          },
        });
        return;
      }
      
      const limit = Math.min(parseInt(req.query.limit as string) || 4, 20);

      logger.info('Related products requested', {
        productId: id,
        limit,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });

      const products = await storefrontService.getRelatedProducts(id, limit);

      const response = {
        data: products.map(product => ({
          id: product.id,
          title: product.title,
          description: product.description,
          enabled: product.enabled,
          created_at: product.created_at,
          updated_at: product.updated_at,
          url: `/products/${product.id}`,
          shareUrl: `${req.protocol}://${req.get('host')}/products/${product.id}`,
        })),
        meta: {
          baseProductId: id,
          count: products.length,
          limit,
        },
      };

      logger.info('Related products response', {
        productId: id,
        count: response.data.length,
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to fetch related products', error as Error, {
        productId: req.params.id,
        query: req.query,
        ip: req.ip,
      });

      res.status(500).json({
        error: {
          code: ErrorCode.API_SERVER_ERROR,
          message: 'Failed to fetch related products',
          type: 'server_error',
        },
      });
    }
  });

  /**
   * GET /store/printify/products/:id/variants
   * Get product variants
   */
  router.get('/products/:id/variants', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Product ID is required',
            type: 'validation_error',
          },
        });
        return;
      }

      logger.info('Product variants requested', {
        productId: id,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });

      const variants = await storefrontService.getProductVariants(id);

      const response = {
        data: variants.map(variant => ({
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          options: variant.options,
          price: variant.price,
          images: variant.images,
          inventory: variant.inventory,
          isAvailable: variant.isAvailable,
          isEnabled: variant.isEnabled,
        })),
        meta: {
          productId: id,
          count: variants.length,
        },
      };

      logger.info('Product variants response', {
        productId: id,
        count: response.data.length,
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to fetch product variants', error as Error, {
        productId: req.params.id,
        ip: req.ip,
      });

      res.status(500).json({
        error: {
          code: ErrorCode.API_SERVER_ERROR,
          message: 'Failed to fetch product variants',
          type: 'server_error',
        },
      });
    }
  });

  return router;
}