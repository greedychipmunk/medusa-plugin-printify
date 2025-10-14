/**
 * Storefront Product Service
 * 
 * Handles product browsing, search, and filtering for the storefront.
 * Provides customer-facing product data with pricing, availability, and variants.
 */

import { PrintifyProduct } from '../models/printify-product';
import { PrintifyProductVariant } from '../models/printify-product-variant';
import { PrintifyApiClient } from './printify-api-client';
import { logger } from '../utils/logger';
import { PrintifyPluginError, ErrorCode, ErrorSeverity } from '../utils/error-handling';

export interface StorefrontProductFilters {
  category?: string;
  tags?: string[];
  priceMin?: number;
  priceMax?: number;
  available?: boolean;
  onSale?: boolean;
  search?: string;
}

export interface StorefrontProductSort {
  field: 'title' | 'price' | 'created_at' | 'updated_at' | 'popularity';
  direction: 'asc' | 'desc';
}

export interface StorefrontProductListOptions {
  filters?: StorefrontProductFilters;
  sort?: StorefrontProductSort;
  limit?: number;
  offset?: number;
  includeVariants?: boolean;
}

export interface StorefrontProductListResult {
  products: PrintifyProduct[];
  total: number;
  hasMore: boolean;
  filters: {
    categories: string[];
    tags: string[];
    priceRange: { min: number; max: number };
  };
}

export interface ProductSearchResult extends StorefrontProductListResult {
  suggestions: string[];
  searchTerm: string;
}

export class StorefrontProductService {
  private apiClient: PrintifyApiClient;
  private productCache: Map<string, { product: PrintifyProduct; expiry: number }> = new Map();
  private variantCache: Map<string, { variants: PrintifyProductVariant[]; expiry: number }> = new Map();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes

  constructor(apiClient: PrintifyApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Get products for storefront display
   */
  async getProducts(options: StorefrontProductListOptions = {}): Promise<StorefrontProductListResult> {
    try {
      const {
        filters = {},
        sort = { field: 'created_at', direction: 'desc' },
        limit = 20,
        offset = 0,
        includeVariants = false,
      } = options;

      logger.info('Fetching storefront products', { filters, sort, limit, offset });

      // In a real implementation, this would query the database
      // For now, we'll simulate the response structure
      const mockProducts: PrintifyProduct[] = [];
      const total = 0;

      // Apply filters
      let filteredProducts = mockProducts;

      if (filters.category) {
        filteredProducts = filteredProducts.filter(p => {
          const productTags = this.getProductTags(p);
          return productTags.some((tag: string) => tag.toLowerCase().includes(filters.category!.toLowerCase()));
        });
      }

      if (filters.tags && filters.tags.length > 0) {
        filteredProducts = filteredProducts.filter(p => {
          const productTags = this.getProductTags(p);
          return filters.tags!.some(filterTag =>
            productTags.some((productTag: string) => productTag.toLowerCase().includes(filterTag.toLowerCase()))
          );
        });
      }

      if (filters.available !== undefined) {
        filteredProducts = filteredProducts.filter(p => p.enabled === filters.available);
      }

      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        filteredProducts = filteredProducts.filter(p => {
          const productTags = this.getProductTags(p);
          return p.title.toLowerCase().includes(searchTerm) ||
            (p.description && p.description.toLowerCase().includes(searchTerm)) ||
            productTags.some((tag: string) => tag.toLowerCase().includes(searchTerm));
        });
      }

      // Apply sorting
      filteredProducts.sort((a, b) => {
        let comparison = 0;
        
        switch (sort.field) {
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
          case 'price':
            // Would need to get variant prices for sorting
            comparison = 0;
            break;
          case 'created_at':
            comparison = a.created_at.getTime() - b.created_at.getTime();
            break;
          case 'updated_at':
            comparison = a.updated_at.getTime() - b.updated_at.getTime();
            break;
          case 'popularity':
            // Would need view/purchase tracking for popularity
            comparison = 0;
            break;
        }

        return sort.direction === 'desc' ? -comparison : comparison;
      });

      // Apply pagination
      const paginatedProducts = filteredProducts.slice(offset, offset + limit);

      // Load variants if requested
      if (includeVariants) {
        for (const product of paginatedProducts) {
          try {
            const variants = await this.getProductVariants(product.id);
            (product as any).variants = variants;
          } catch (error) {
            logger.warn(`Failed to load variants for product ${product.id}`, { error });
          }
        }
      }

      // Get filter options for faceted search
      const availableFilters = this.getAvailableFilters(mockProducts);

      const result: StorefrontProductListResult = {
        products: paginatedProducts,
        total: filteredProducts.length,
        hasMore: offset + limit < filteredProducts.length,
        filters: availableFilters,
      };

      logger.info('Successfully fetched storefront products', {
        count: paginatedProducts.length,
        total: result.total,
        hasMore: result.hasMore,
      });

      return result;
    } catch (error) {
      logger.error('Failed to fetch storefront products', error as Error, { options });
      throw new PrintifyPluginError(
        ErrorCode.API_SERVER_ERROR,
        'Failed to fetch products',
        ErrorSeverity.MEDIUM,
        { options }
      );
    }
  }

  /**
   * Search products
   */
  async searchProducts(
    searchTerm: string,
    options: Omit<StorefrontProductListOptions, 'filters'> = {}
  ): Promise<ProductSearchResult> {
    try {
      logger.info('Searching products', { searchTerm, options });

      const searchOptions: StorefrontProductListOptions = {
        ...options,
        filters: {
          search: searchTerm,
        },
      };

      const result = await this.getProducts(searchOptions);

      // Generate search suggestions
      const suggestions = this.generateSearchSuggestions(searchTerm);

      const searchResult: ProductSearchResult = {
        ...result,
        suggestions,
        searchTerm,
      };

      logger.info('Successfully completed product search', {
        searchTerm,
        count: result.products.length,
        suggestionsCount: suggestions.length,
      });

      return searchResult;
    } catch (error) {
      logger.error('Failed to search products', error as Error, { searchTerm, options });
      throw new PrintifyPluginError(
        ErrorCode.API_SERVER_ERROR,
        'Failed to search products',
        ErrorSeverity.MEDIUM,
        { searchTerm, options }
      );
    }
  }

  /**
   * Get single product for storefront
   */
  async getProduct(productId: string, includeVariants = true): Promise<PrintifyProduct | null> {
    try {
      // Check cache first
      const cached = this.productCache.get(productId);
      if (cached && cached.expiry > Date.now()) {
        logger.debug('Returning cached product', { productId });
        
        if (includeVariants) {
          const variants = await this.getProductVariants(productId);
          (cached.product as any).variants = variants;
        }
        
        return cached.product;
      }

      logger.info('Fetching product for storefront', { productId });

      // In a real implementation, this would query the database
      // For now, return null as we don't have actual data
      const product: PrintifyProduct | null = null;

      if (product) {
        // Cache the product
        this.productCache.set(productId, {
          product,
          expiry: Date.now() + this.cacheExpiry,
        });

        if (includeVariants) {
          const variants = await this.getProductVariants(productId);
          (product as any).variants = variants;
        }

        logger.info('Successfully fetched product', { productId });
      } else {
        logger.warn('Product not found or not enabled', { productId });
      }

      return product;
    } catch (error) {
      logger.error('Failed to fetch product', error as Error, { productId });
      throw new PrintifyPluginError(
        ErrorCode.PRODUCT_NOT_FOUND,
        'Failed to fetch product',
        ErrorSeverity.MEDIUM,
        { productId }
      );
    }
  }

  /**
   * Get product variants
   */
  async getProductVariants(productId: string): Promise<PrintifyProductVariant[]> {
    try {
      // Check cache first
      const cached = this.variantCache.get(productId);
      if (cached && cached.expiry > Date.now()) {
        logger.debug('Returning cached variants', { productId });
        return cached.variants;
      }

      logger.info('Fetching product variants', { productId });

      // In a real implementation, this would query the database or API
      // For now, return empty array
      const variants: PrintifyProductVariant[] = [];

      // Cache the variants
      this.variantCache.set(productId, {
        variants,
        expiry: Date.now() + this.cacheExpiry,
      });

      logger.info('Successfully fetched product variants', {
        productId,
        variantCount: variants.length,
      });

      return variants;
    } catch (error) {
      logger.error('Failed to fetch product variants', error as Error, { productId });
      throw new PrintifyPluginError(
        ErrorCode.API_SERVER_ERROR,
        'Failed to fetch product variants',
        ErrorSeverity.MEDIUM,
        { productId }
      );
    }
  }

  /**
   * Get featured products
   */
  async getFeaturedProducts(limit = 8): Promise<PrintifyProduct[]> {
    try {
      logger.info('Fetching featured products', { limit });

      const result = await this.getProducts({
        sort: { field: 'popularity', direction: 'desc' },
        limit,
        filters: { available: true },
        includeVariants: true,
      });

      logger.info('Successfully fetched featured products', {
        count: result.products.length,
      });

      return result.products;
    } catch (error) {
      logger.error('Failed to fetch featured products', error as Error, { limit });
      throw new PrintifyPluginError(
        ErrorCode.API_SERVER_ERROR,
        'Failed to fetch featured products',
        ErrorSeverity.MEDIUM,
        { limit }
      );
    }
  }

  /**
   * Get related products
   */
  async getRelatedProducts(productId: string, limit = 4): Promise<PrintifyProduct[]> {
    try {
      logger.info('Fetching related products', { productId, limit });

      // Get the base product to understand its tags/category
      const baseProduct = await this.getProduct(productId, false);
      if (!baseProduct) {
        return [];
      }

      const baseTags = this.getProductTags(baseProduct);
      const result = await this.getProducts({
        filters: {
          tags: baseTags.slice(0, 3), // Use first few tags for relation
          available: true,
        },
        limit: limit + 1, // Get one extra to exclude the base product
        includeVariants: true,
      });

      // Filter out the base product itself
      const relatedProducts = result.products.filter(p => p.id !== productId);

      logger.info('Successfully fetched related products', {
        productId,
        count: relatedProducts.length,
      });

      return relatedProducts.slice(0, limit);
    } catch (error) {
      logger.error('Failed to fetch related products', error as Error, { productId, limit });
      return []; // Return empty array on error rather than throwing
    }
  }

  /**
   * Get available filters for faceted search
   */
  private getAvailableFilters(products: PrintifyProduct[]): {
    categories: string[];
    tags: string[];
    priceRange: { min: number; max: number };
  } {
    const allTags = new Set<string>();
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    products.forEach(product => {
      const productTags = this.getProductTags(product);
      productTags.forEach((tag: string) => allTags.add(tag));
      // Would need to check variant prices for actual price range
    });

    return {
      categories: Array.from(allTags).slice(0, 20), // Limit categories
      tags: Array.from(allTags),
      priceRange: {
        min: minPrice === Infinity ? 0 : minPrice,
        max: maxPrice === -Infinity ? 0 : maxPrice,
      },
    };
  }

  /**
   * Generate search suggestions
   */
  private generateSearchSuggestions(searchTerm: string): string[] {
    // In a real implementation, this would use a search index or analytics
    const commonSuggestions = [
      't-shirt',
      'hoodie',
      'mug',
      'poster',
      'phone case',
      'tote bag',
      'sticker',
      'canvas print',
    ];

    return commonSuggestions
      .filter(suggestion => 
        suggestion.toLowerCase().includes(searchTerm.toLowerCase()) ||
        searchTerm.toLowerCase().includes(suggestion.toLowerCase())
      )
      .slice(0, 5);
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.productCache.clear();
    this.variantCache.clear();
    logger.info('Cleared storefront product caches');
  }

  /**
   * Extract tags from product data
   */
  private getProductTags(product: PrintifyProduct): string[] {
    // Extract tags from printify_data if available
    if (product.printify_data && product.printify_data.tags) {
      return Array.isArray(product.printify_data.tags) 
        ? product.printify_data.tags 
        : [product.printify_data.tags];
    }
    
    // Return empty array if no tags
    return [];
  }
}