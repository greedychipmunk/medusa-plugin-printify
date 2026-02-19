/**
 * Temporary Type Definitions
 * 
 * Basic interfaces for service type checking during DML transition.
 * These will be replaced with proper DML types in the next phase.
 */

export interface PrintifyOrderShippingAddress {
  first_name: string;
  last_name: string;
  company?: string;
  region: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface PrintifyOrderType {
  id: string;
  medusa_order_id: string;
  printify_order_id?: string;
  configuration_id: string;
  status: string;
  line_items: any[];
  shipping_address: any;
  total_price: number;
  subtotal?: number;
  shipping_cost?: number;
  tax_amount?: number;
  discount_amount?: number;
  tracking?: any;
  printify_data?: any;
  submitted_at?: Date;
  error_details?: string;
  created_at: Date;
  updated_at: Date;
  
  // Backward compatibility aliases
  medusaOrderId: string;
  printifyOrderId?: string;
  customerId?: string;
  customerEmail?: string;
  pricing: any;
  items: any[];
  shippingAddress: any;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  retryCount: number;
  maxRetries: number;
  
  // Method signatures for compatibility
  updateStatus(status: string, note?: string, printifyOrderId?: string): void;
  clearError(): void;
  setError(message: string): void;
  updateTracking(tracking: any): void;
  canSubmit(): boolean;
  canCancel(): boolean;
  isFinalStatus(): boolean;
  getFormattedTotal(): string;
  getOrderDuration(): number;
}

export interface PrintifyConfigurationType {
  id: string;
  store_id: string;
  printify_api_key: string;
  printify_shop_id: string;
  webhook_secret?: string;
  sync_enabled: boolean;
  sync_frequency: number;
  created_at: Date;
  updated_at: Date;
  
  // Method signatures for compatibility
  getApiKey(): string;
  getWebhookSecret(): string | undefined;
  setApiKey(apiKey: string): void;
  setWebhookSecret(secret: string): void;
  updateSyncSettings(enabled: boolean, frequency: number): void;
}

export interface PrintifyProductType {
  id: string;
  printify_product_id: string;
  medusa_product_id?: string;
  configuration_id: string;
  title: string;
  description?: string;
  enabled: boolean;
  blueprint_id: string;
  print_provider_id: string;
  tags?: any;
  images?: any;
  printify_data?: any;
  last_sync_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// Legacy support for undefined types
export interface PrintifyProductData {
  printify_product_id: string;
  title: string;
  description?: string;
  blueprint_id: string;
  print_provider_id: string;
}

// Type aliases for DML entities to resolve conflicts
export type PrintifyProductEntity = {
  id: string;
  printify_product_id: string;
  medusa_product_id?: string;
  configuration_id: string;
  title: string;
  description?: string;
  enabled: boolean;
  blueprint_id: string;
  print_provider_id: string;
  tags?: any;
  images?: any;
  printify_data?: any;
  last_sync_at?: Date;
  created_at: Date;
  updated_at: Date;
};

export type PrintifyOrderEntity = PrintifyOrderType;
export type PrintifyConfigurationEntity = PrintifyConfigurationType;