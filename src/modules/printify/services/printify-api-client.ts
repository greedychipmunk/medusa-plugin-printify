import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { RateLimiter, RateLimitState } from '../utils/rate-limiter';

/**
 * Printify API Client
 * 
 * Handles all communication with the Printify API including authentication,
 * error handling, rate limiting, and response parsing.
 */

export interface PrintifyApiLogger {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
}

export interface PrintifyApiConfig {
  apiKey: string;
  shopId: string;
  timeout?: number;
  baseUrl?: string;
  logger?: PrintifyApiLogger;
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

export interface PrintifyWebhook {
  id: string;
  topic: string;
  url: string;
  shop_id: string;
  secret: string;
}

export interface PrintifyShippingRequest {
  line_items: Array<{ product_id: string; variant_id: number; quantity: number }>;
  address_to: {
    first_name: string;
    last_name: string;
    address1: string;
    address2?: string;
    city: string;
    state_code?: string;
    zip: string;
    country_code: string;
  };
}

export interface PrintifyShippingOption {
  id: number;
  name: string;
  cost: number;
  currency: string;
  estimated_delivery_min?: number;
  estimated_delivery_max?: number;
}

export interface PrintifyApiError {
  error: string;
  message: string;
  status: number;
}

export class PrintifyApiClient {
  private client: AxiosInstance;
  private config: PrintifyApiConfig;
  private rateLimiter: RateLimiter;

  constructor(config: PrintifyApiConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter();
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
        this.config.logger?.debug?.(`Printify API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.config.logger?.error?.(`Printify API Request Error: ${error}`);
        return Promise.reject(error);
      }
    );

    // Response interceptor for rate limit tracking and error handling
    instance.interceptors.response.use(
      (response) => {
        this.rateLimiter.updateFromHeaders(response.headers);
        this.config.logger?.debug?.(`Printify API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        if (error.response?.status === 429) {
          const config = error.config as InternalAxiosRequestConfig & { __retryCount?: number };
          config.__retryCount = config.__retryCount || 0;

          if (this.rateLimiter.shouldRetry(config.__retryCount)) {
            config.__retryCount++;
            const delay = this.rateLimiter.getRetryDelay(
              config.__retryCount,
              error.response.headers?.['retry-after'],
            );
            this.config.logger?.warn?.(`Rate limited (429). Retry ${config.__retryCount} in ${delay}ms`);
            return new Promise((resolve) => setTimeout(resolve, delay))
              .then(() => instance.request(config));
          }
          this.config.logger?.error?.(`Rate limit exceeded after ${config.__retryCount} retries`);
        }

        const printifyError = this.handleApiError(error);
        this.config.logger?.error?.(`Printify API Error: ${JSON.stringify(printifyError)}`);
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
      this.config.logger?.error?.(`Printify API connection test failed: ${error}`);
      return false;
    }
  }

  /**
   * Get rate limit information from last response
   */
  getRateLimitInfo(): RateLimitState {
    return this.rateLimiter.getRateLimitInfo();
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
   * Calculate shipping rates for a set of line items and address
   */
  async calculateShipping(request: PrintifyShippingRequest): Promise<PrintifyShippingOption[]> {
    const response = await this.client.post(
      `/shops/${this.config.shopId}/orders/shipping.json`,
      request,
    );
    const data = response.data;
    // Handle both { shipping: [...] } and direct array response formats
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.shipping)) {
      return data.shipping;
    }
    throw new Error('Invalid shipping response format from Printify API');
  }

  /**
   * List all webhooks for the shop
   */
  async listWebhooks(): Promise<PrintifyWebhook[]> {
    const response = await this.client.get(`/shops/${this.config.shopId}/webhooks.json`);
    return response.data;
  }

  /**
   * Create a new webhook for the shop
   */
  async createWebhook(topic: string, url: string, secret?: string): Promise<PrintifyWebhook> {
    const payload: Record<string, string> = { topic, url };
    if (secret) {
      payload.secret = secret;
    }
    const response = await this.client.post(`/shops/${this.config.shopId}/webhooks.json`, payload);
    return response.data;
  }

  /**
   * Delete a webhook by ID
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    await this.client.delete(`/shops/${this.config.shopId}/webhooks/${webhookId}.json`);
  }

  /**
   * Create a new client instance with different configuration
   */
  static create(config: PrintifyApiConfig): PrintifyApiClient {
    return new PrintifyApiClient(config);
  }
}