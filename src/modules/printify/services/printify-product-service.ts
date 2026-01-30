/**
 * PrintifyProductService
 * 
 * Service for managing Printify products including synchronization,
 * enablement management, and product data operations.
 */

import PrintifyProduct from '../models/printify-product';
import { PrintifyProductType as PrintifyProductTemp, PrintifyProductData, PrintifyProductEntity } from '../types';
import { ProductEnablementHistory } from '../models/product-enablement-history';
import { SyncLog } from '../models/sync-log';
import { PrintifyApiClient, PrintifyProduct as ApiProduct } from './printify-api-client';
import { logger } from '../utils/logger';
import { ErrorFactory, PrintifyPluginError } from '../utils/error-handling';

export interface ProductListOptions {
  page?: number;
  limit?: number;
  enabled?: boolean;
  search?: string;
  sort?: 'title' | 'created_at' | 'updated_at' | 'last_sync_at';
  order?: 'asc' | 'desc';
}

export interface ProductListResult {
  products: PrintifyProductEntity[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface BulkOperationResult {
  success_count: number;
  failure_count: number;
  failures: Array<{
    product_id: string;
    error: string;
  }>;
  bulk_operation_id: string;
}

export interface SyncProductsOptions {
  force?: boolean;
  max_age_minutes?: number;
}

export interface SyncProductsResult {
  synced_count: number;
  failed_count: number;
  skipped_count: number;
  sync_log_id: string;
}

/**
 * Service for managing Printify products
 */
export class PrintifyProductService {
  private logger = logger.child('ProductService');

  constructor(
    private apiClient: PrintifyApiClient,
    private configurationId: string
  ) {}

  /**
   * Get paginated list of products
   */
  async getProducts(options: ProductListOptions = {}): Promise<ProductListResult> {
    const { page = 1, limit = 50, enabled, search, sort = 'created_at', order = 'desc' } = options;
    
    this.logger.info('Getting products list', { 
      page, 
      limit, 
      enabled, 
      search, 
      sort, 
      order,
      configurationId: this.configurationId 
    });

    try {
      // In a real implementation, this would query the database with filters
      // For now, return empty result
      const result: ProductListResult = {
        products: [],
        total: 0,
        page,
        limit,
        total_pages: 0,
      };

      this.logger.debug('Products list retrieved', { 
        count: result.products.length,
        total: result.total 
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to get products list', error as Error, { options });
      throw ErrorFactory.databaseError('Failed to retrieve products', error as Error);
    }
  }

  /**
   * Get single product by ID
   */
  async getProduct(productId: string): Promise<PrintifyProductEntity | null> {
    this.logger.info('Getting product', { productId, configurationId: this.configurationId });

    try {
      // In a real implementation, this would query the database
      // For now, return null
      return null;
    } catch (error) {
      this.logger.error('Failed to get product', error as Error, { productId });
      throw ErrorFactory.databaseError('Failed to retrieve product', error as Error);
    }
  }

  /**
   * Enable a product for storefront display
   */
  async enableProduct(productId: string, triggeredBy: string, reason?: string): Promise<PrintifyProductEntity> {
    this.logger.info('Enabling product', { productId, triggeredBy, reason });

    try {
      const product = await this.getProduct(productId);
      if (!product) {
        throw ErrorFactory.productError('Product not found', { productId });
      }

      const previousState = product.enabled;
      product.enabled = true;

      // Create history record
      const historyRecord = ProductEnablementHistory.forProductEnable({
        product_id: productId,
        configuration_id: this.configurationId,
        previous_state: previousState,
        triggered_by: triggeredBy,
        reason,
      });

      // In a real implementation, this would save to database
      this.logger.info('Product enabled successfully', { 
        productId, 
        previousState,
        triggeredBy 
      });

      return product;
    } catch (error) {
      this.logger.error('Failed to enable product', error as Error, { productId, triggeredBy });
      
      if (error instanceof PrintifyPluginError) {
        throw error;
      }
      
      throw ErrorFactory.productError('Failed to enable product', { productId });
    }
  }

  /**
   * Disable a product from storefront display
   */
  async disableProduct(productId: string, triggeredBy: string, reason?: string): Promise<PrintifyProductEntity> {
    this.logger.info('Disabling product', { productId, triggeredBy, reason });

    try {
      const product = await this.getProduct(productId);
      if (!product) {
        throw ErrorFactory.productError('Product not found', { productId });
      }

      const previousState = product.enabled;
      product.enabled = false;

      // Create history record
      const historyRecord = ProductEnablementHistory.forProductDisable({
        product_id: productId,
        configuration_id: this.configurationId,
        previous_state: previousState,
        triggered_by: triggeredBy,
        reason,
      });

      // In a real implementation, this would save to database
      this.logger.info('Product disabled successfully', { 
        productId, 
        previousState,
        triggeredBy 
      });

      return product;
    } catch (error) {
      this.logger.error('Failed to disable product', error as Error, { productId, triggeredBy });
      
      if (error instanceof PrintifyPluginError) {
        throw error;
      }
      
      throw ErrorFactory.productError('Failed to disable product', { productId });
    }
  }

  /**
   * Enable multiple products in bulk
   */
  async bulkEnableProducts(
    productIds: string[], 
    triggeredBy: string, 
    reason?: string
  ): Promise<BulkOperationResult> {
    const bulkOperationId = ProductEnablementHistory.generateBulkOperationId();
    
    this.logger.info('Bulk enabling products', { 
      productCount: productIds.length,
      bulkOperationId,
      triggeredBy 
    });

    const result: BulkOperationResult = {
      success_count: 0,
      failure_count: 0,
      failures: [],
      bulk_operation_id: bulkOperationId,
    };

    for (const productId of productIds) {
      try {
        const product = await this.getProduct(productId);
        if (!product) {
          result.failure_count++;
          result.failures.push({
            product_id: productId,
            error: 'Product not found',
          });
          continue;
        }

        const previousState = product.enabled;
        product.enabled = true;

        // Create history record
        const historyRecord = ProductEnablementHistory.forBulkEnable({
          product_id: productId,
          configuration_id: this.configurationId,
          previous_state: previousState,
          triggered_by: triggeredBy,
          bulk_operation_id: bulkOperationId,
          reason,
        });

        // In a real implementation, this would save to database
        result.success_count++;
        
        this.logger.debug('Product enabled in bulk operation', { 
          productId, 
          bulkOperationId 
        });
      } catch (error) {
        result.failure_count++;
        result.failures.push({
          product_id: productId,
          error: (error as Error).message,
        });
        
        this.logger.warn('Failed to enable product in bulk operation', { 
          productId, 
          bulkOperationId,
          error: (error as Error).message
        });
      }
    }

    this.logger.info('Bulk enable operation completed', { 
      bulkOperationId,
      successCount: result.success_count,
      failureCount: result.failure_count 
    });

    return result;
  }

  /**
   * Disable multiple products in bulk
   */
  async bulkDisableProducts(
    productIds: string[], 
    triggeredBy: string, 
    reason?: string
  ): Promise<BulkOperationResult> {
    const bulkOperationId = ProductEnablementHistory.generateBulkOperationId();
    
    this.logger.info('Bulk disabling products', { 
      productCount: productIds.length,
      bulkOperationId,
      triggeredBy 
    });

    const result: BulkOperationResult = {
      success_count: 0,
      failure_count: 0,
      failures: [],
      bulk_operation_id: bulkOperationId,
    };

    for (const productId of productIds) {
      try {
        const product = await this.getProduct(productId);
        if (!product) {
          result.failure_count++;
          result.failures.push({
            product_id: productId,
            error: 'Product not found',
          });
          continue;
        }

        const previousState = product.enabled;
        product.enabled = false;

        // Create history record
        const historyRecord = ProductEnablementHistory.forBulkDisable({
          product_id: productId,
          configuration_id: this.configurationId,
          previous_state: previousState,
          triggered_by: triggeredBy,
          bulk_operation_id: bulkOperationId,
          reason,
        });

        // In a real implementation, this would save to database
        result.success_count++;
        
        this.logger.debug('Product disabled in bulk operation', { 
          productId, 
          bulkOperationId 
        });
      } catch (error) {
        result.failure_count++;
        result.failures.push({
          product_id: productId,
          error: (error as Error).message,
        });
        
        this.logger.warn('Failed to disable product in bulk operation', { 
          productId, 
          bulkOperationId,
          error: (error as Error).message
        });
      }
    }

    this.logger.info('Bulk disable operation completed', { 
      bulkOperationId,
      successCount: result.success_count,
      failureCount: result.failure_count 
    });

    return result;
  }

  /**
   * Synchronize products from Printify
   */
  async syncProducts(options: SyncProductsOptions = {}): Promise<SyncProductsResult> {
    const { force = false, max_age_minutes = 60 } = options;
    
    this.logger.info('Starting product synchronization', { 
      force, 
      maxAgeMinutes: max_age_minutes,
      configurationId: this.configurationId 
    });

    // Create sync log
    const syncLog = SyncLog.create({
      configuration_id: this.configurationId,
      type: force ? 'manual_sync' : 'full_sync',
      details: { force, max_age_minutes },
    });

    syncLog.markRunning();

    try {
      // Get products from Printify API
      const printifyProducts = await this.fetchAllPrintifyProducts();
      
      let syncedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      for (const apiProduct of printifyProducts) {
        try {
          await this.syncSingleProduct(apiProduct, force, max_age_minutes);
          syncedCount++;
        } catch (error) {
          this.logger.warn('Failed to sync product', { 
            printifyProductId: apiProduct.id,
            error: (error as Error).message
          });
          failedCount++;
        }
      }

      // Update sync log
      syncLog.updateProgress(syncedCount, failedCount);
      syncLog.addDetails('skipped_count', skippedCount);
      syncLog.markCompleted();

      const result: SyncProductsResult = {
        synced_count: syncedCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
        sync_log_id: syncLog.id,
      };

      this.logger.info('Product synchronization completed', result);

      return result;
    } catch (error) {
      syncLog.markFailed((error as Error).message);
      this.logger.error('Product synchronization failed', error as Error);
      
      throw ErrorFactory.productError('Product synchronization failed', {
        configurationId: this.configurationId,
      });
    }
  }

  /**
   * Fetch all products from Printify API with pagination
   */
  private async fetchAllPrintifyProducts(): Promise<ApiProduct[]> {
    const allProducts: ApiProduct[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.apiClient.getProducts(page, 100);
      allProducts.push(...response.data);
      
      hasMore = page < response.last_page;
      page++;
    }

    this.logger.debug('Fetched all Printify products', { count: allProducts.length });
    
    return allProducts;
  }

  /**
   * Synchronize a single product
   */
  private async syncSingleProduct(
    apiProduct: ApiProduct, 
    force: boolean, 
    maxAgeMinutes: number
  ): Promise<void> {
    // Check if product exists locally
    const existingProduct = await this.findProductByPrintifyId(apiProduct.id);

    if (existingProduct) {
      // Skip if not forced and product doesn't need sync
      if (!force && existingProduct.last_sync_at && 
          (new Date().getTime() - existingProduct.last_sync_at.getTime()) < maxAgeMinutes * 60 * 1000) {
        return;
      }

      // Update existing product from Printify data
      existingProduct.title = apiProduct.title;
      existingProduct.description = apiProduct.description;
      existingProduct.tags = apiProduct.tags;
      existingProduct.images = apiProduct.images;
      existingProduct.printify_data = apiProduct;
      existingProduct.last_sync_at = new Date();
      existingProduct.updated_at = new Date();
      // In a real implementation, save to database
    } else {
      // Create new product (temporary DML compatibility)
      const newProduct: PrintifyProductEntity = {
        id: `product_${Date.now()}_${apiProduct.id}`,
        printify_product_id: apiProduct.id,
        configuration_id: this.configurationId,
        title: apiProduct.title,
        description: apiProduct.description,
        enabled: false, // Default to disabled for new products
        blueprint_id: apiProduct.blueprint_id.toString(),
        print_provider_id: '0', // TODO: Get from blueprint data
        tags: apiProduct.tags,
        images: apiProduct.images,
        printify_data: apiProduct,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      // In a real implementation, save to database
    }
  }

  /**
   * Find product by Printify product ID
   */
  private async findProductByPrintifyId(printifyProductId: string): Promise<PrintifyProductEntity | null> {
    // In a real implementation, this would query the database
    // For now, return null
    return null;
  }

  /**
   * Get product enablement history
   */
  async getProductHistory(productId: string): Promise<ProductEnablementHistory[]> {
    this.logger.info('Getting product history', { productId });

    try {
      // In a real implementation, this would query the database
      // For now, return empty array
      return [];
    } catch (error) {
      this.logger.error('Failed to get product history', error as Error, { productId });
      throw ErrorFactory.databaseError('Failed to retrieve product history', error as Error);
    }
  }
}