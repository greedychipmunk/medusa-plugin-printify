import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * Printify API Client
 * 
 * Handles all communication with the Printify API including authentication,
 * error handling, rate limiting, and response parsing.
 */

export interface PrintifyApiConfig {
  apiKey: string;
  shopId: string;
  timeout?: number;
  baseUrl?: string;
}

export interface PrintifyProduct {
  id: string;
  title: string;
  description: string;
  tags: string[];
  options: PrintifyProductOption[];
  variants: PrintifyProductVariant[];
  images: PrintifyProductImage[];
  created_at: string;
  updated_at: string;
  visible: boolean;
  is_locked: boolean;
  blueprint_id: number;
  user_id: number;
  shop_id: number;
}

export interface PrintifyProductOption {
  name: string;
  type: string;
  values: PrintifyOptionValue[];
}

export interface PrintifyOptionValue {
  id: number;
  title: string;
  colors?: string[];
}

export interface PrintifyProductVariant {
  id: number;
  sku: string;
  cost: number;
  price: number;
  title: string;
  grams: number;
  is_enabled: boolean;
  is_default: boolean;
  is_available: boolean;
  options: number[];
}

export interface PrintifyProductImage {
  src: string;
  variant_ids: number[];
  position: string;
  is_default: boolean;
}

export interface PrintifyShop {
  id: number;
  title: string;
  sales_channel: string;
}

export interface PrintifyApiError {
  error: string;
  message: string;
  status: number;
}

export class PrintifyApiClient {
  private client: AxiosInstance;
  private config: PrintifyApiConfig;

  constructor(config: PrintifyApiConfig) {
    this.config = config;
    this.client = this.createAxiosInstance();
  }

  /**
   * Create configured Axios instance
   */
  private createAxiosInstance(): AxiosInstance {
    const instance = axios.create({
      baseURL: this.config.baseUrl || 'https://api.printify.com/v1',
      timeout: this.config.timeout || 10000,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'medusa-plugin-printify/1.0.0',
      },
    });

    // Request interceptor for logging
    instance.interceptors.request.use(
      (config) => {
        console.log(`🌐 Printify API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ Printify API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    instance.interceptors.response.use(
      (response) => {
        console.log(`✅ Printify API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        const printifyError = this.handleApiError(error);
        console.error('❌ Printify API Error:', printifyError);
        return Promise.reject(printifyError);
      }
    );

    return instance;
  }

  /**
   * Handle API errors and convert to standardized format
   */
  private handleApiError(error: any): PrintifyApiError {
    if (error.response) {
      // Server responded with error status
      return {
        error: error.response.data?.error || 'API Error',
        message: error.response.data?.message || error.message,
        status: error.response.status,
      };
    } else if (error.request) {
      // Request made but no response received
      return {
        error: 'Network Error',
        message: 'No response received from Printify API',
        status: 0,
      };
    } else {
      // Something else happened
      return {
        error: 'Request Error',
        message: error.message || 'Unknown error occurred',
        status: 0,
      };
    }
  }

  /**
   * Get shop information
   */
  async getShop(): Promise<PrintifyShop> {
    const response = await this.client.get(`/shops/${this.config.shopId}.json`);
    return response.data;
  }

  /**
   * Get all products from shop
   */
  async getProducts(page: number = 1, limit: number = 100): Promise<{
    data: PrintifyProduct[];
    current_page: number;
    last_page: number;
    total: number;
  }> {
    const response = await this.client.get(`/shops/${this.config.shopId}/products.json`, {
      params: { page, limit },
    });
    return response.data;
  }

  /**
   * Get specific product by ID
   */
  async getProduct(productId: string): Promise<PrintifyProduct> {
    const response = await this.client.get(`/shops/${this.config.shopId}/products/${productId}.json`);
    return response.data;
  }

  /**
   * Create a new product
   */
  async createProduct(productData: Partial<PrintifyProduct>): Promise<PrintifyProduct> {
    const response = await this.client.post(`/shops/${this.config.shopId}/products.json`, productData);
    return response.data;
  }

  /**
   * Update existing product
   */
  async updateProduct(productId: string, productData: Partial<PrintifyProduct>): Promise<PrintifyProduct> {
    const response = await this.client.put(`/shops/${this.config.shopId}/products/${productId}.json`, productData);
    return response.data;
  }

  /**
   * Delete product
   */
  async deleteProduct(productId: string): Promise<void> {
    await this.client.delete(`/shops/${this.config.shopId}/products/${productId}.json`);
  }

  /**
   * Publish product to shop
   */
  async publishProduct(productId: string): Promise<PrintifyProduct> {
    const response = await this.client.post(`/shops/${this.config.shopId}/products/${productId}/publishing_succeeded.json`);
    return response.data;
  }

  /**
   * Unpublish product from shop
   */
  async unpublishProduct(productId: string): Promise<PrintifyProduct> {
    const response = await this.client.post(`/shops/${this.config.shopId}/products/${productId}/publishing_failed.json`);
    return response.data;
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getShop();
      return true;
    } catch (error) {
      console.error('❌ Printify API connection test failed:', error);
      return false;
    }
  }

  /**
   * Get rate limit information from last response
   */
  getRateLimitInfo(): {
    limit?: number;
    remaining?: number;
    reset?: number;
  } {
    // Note: This would extract rate limit headers from the last response
    // Printify API rate limiting details would need to be implemented
    return {
      limit: undefined,
      remaining: undefined,
      reset: undefined,
    };
  }

  /**
   * Create order
   */
  async createOrder(orderData: any): Promise<any> {
    const response = await this.client.post(`/shops/${this.config.shopId}/orders.json`, orderData);
    return response.data;
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<any> {
    const response = await this.client.get(`/shops/${this.config.shopId}/orders/${orderId}.json`);
    return response.data;
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string): Promise<void> {
    await this.client.delete(`/shops/${this.config.shopId}/orders/${orderId}.json`);
  }

  /**
   * Create a new client instance with different configuration
   */
  static create(config: PrintifyApiConfig): PrintifyApiClient {
    return new PrintifyApiClient(config);
  }
}