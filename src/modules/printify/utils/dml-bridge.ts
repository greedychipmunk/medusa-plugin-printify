/**
 * DML Bridge Utilities
 * 
 * Temporary bridge functions to provide class-like methods for DML entities.
 * This allows existing service code to work with DML entities without major refactoring.
 * 
 * TODO: Remove this bridge in Phase 4 when services are fully modernized for DML patterns.
 */

import type { 
  PrintifyOrderType, 
  PrintifyConfigurationType,
  PrintifyOrderShippingAddress 
} from '../types';
import { PrintifyOrderStatus } from '../models/printify-order';

/**
 * Bridge methods for PrintifyOrder DML entities
 */
export class PrintifyOrderBridge {
  constructor(public entity: PrintifyOrderType | any) {}

  // Getter aliases for backward compatibility
  get id(): string { return this.entity.id; }
  get medusaOrderId(): string { return this.entity.medusa_order_id || this.entity.medusaOrderId; }
  get printifyOrderId(): string | undefined { return this.entity.printify_order_id || this.entity.printifyOrderId; }
  get status(): string { return this.entity.status; }
  get items() { return this.entity.line_items || this.entity.items; }
  get shippingAddress() { return this.entity.shipping_address || this.entity.shippingAddress; }
  get createdAt() { return this.entity.created_at || this.entity.createdAt; }
  get updatedAt() { return this.entity.updated_at || this.entity.updatedAt; }
  get submittedAt() { return this.entity.submitted_at || this.entity.submittedAt; }
  
  // Additional compatibility properties
  get customerId() { return this.entity.customerId; }
  get customerEmail() { return this.entity.customerEmail; }
  get retryCount() { return this.entity.retry_count ?? this.entity.retryCount ?? 0; }
  get maxRetries() { return this.entity.maxRetries || 3; }
  get lastError() { return this.entity.error_details; }
  get tracking() { return this.entity.tracking; }
  get shippingMethod(): number | undefined { return this.entity.shippingMethod; }
  
  // Direct access aliases for API routes
  get line_items() { return this.entity.line_items || this.entity.items; }
  get error_details() { return this.entity.error_details; }
  get last_error_at() { return this.entity.last_error_at; }
  get retry_count() { return this.entity.retry_count ?? this.entity.retryCount ?? 0; }
  
  // Legacy compatibility properties
  get statusHistory() { 
    return [
      { status: 'pending', timestamp: this.entity.created_at, note: 'Order created' },
      { status: 'validated', timestamp: this.entity.created_at, note: 'Order validated' },
      ...(this.entity.status === 'cancelled' ? [{ status: 'cancelled', timestamp: this.entity.updated_at, note: 'Order cancelled' }] : [])
    ];
  }
  
  // Methods for compatibility - removed duplicates, using implementations below
  
  // Pricing compatibility
  get pricing() {
    // Use entity pricing if available, otherwise use the pricing property
    return (this.entity as any).pricing || {
      total: this.entity.total_price || 0,
      currency: 'USD',
      discountAmount: 0,
      subtotal: this.entity.total_price || 0,
      shippingCost: 0,
      taxAmount: 0,
    };
  }

  // Method implementations
  updateStatus(status: PrintifyOrderStatus, note?: string, printifyOrderId?: string): void {
    this.entity.status = status;
    this.entity.updated_at = new Date();
    if (printifyOrderId) {
      this.entity.printify_order_id = printifyOrderId;
    }
    if (status === PrintifyOrderStatus.SUBMITTED && !this.entity.submitted_at) {
      this.entity.submitted_at = new Date();
    }
  }

  clearError(): void {
    this.entity.error_details = undefined;
  }

  setError(message: string): void {
    this.entity.error_details = message;
  }

  updateTracking(tracking: any): void {
    this.entity.tracking = tracking;
    this.entity.updated_at = new Date();
  }

  canSubmit(): boolean {
    return this.entity.status === PrintifyOrderStatus.VALIDATED || 
           this.entity.status === PrintifyOrderStatus.PENDING;
  }

  canCancel(): boolean {
    return this.entity.status !== PrintifyOrderStatus.CANCELLED &&
           this.entity.status !== PrintifyOrderStatus.DELIVERED;
  }

  isFinalStatus(): boolean {
    return [
      PrintifyOrderStatus.DELIVERED,
      PrintifyOrderStatus.CANCELLED,
      PrintifyOrderStatus.FAILED
    ].includes(this.entity.status as PrintifyOrderStatus);
  }

  getFormattedTotal(): string {
    return `$${this.entity.total_price.toFixed(2)}`;
  }

  getOrderDuration(): number {
    if (!this.entity.submitted_at) return 0;
    const now = new Date();
    return now.getTime() - this.entity.submitted_at.getTime();
  }
}

/**
 * Bridge methods for PrintifyConfiguration DML entities  
 */
export class PrintifyConfigurationBridge {
  constructor(private entity: PrintifyConfigurationType) {}

  getApiKey(): string {
    return this.entity.printify_api_key;
  }

  getWebhookSecret(): string | undefined {
    return this.entity.webhook_secret;
  }

  setApiKey(apiKey: string): void {
    this.entity.printify_api_key = apiKey;
    this.entity.updated_at = new Date();
  }

  setWebhookSecret(secret: string): void {
    this.entity.webhook_secret = secret;
    this.entity.updated_at = new Date();
  }

  updateSyncSettings(enabled: boolean, frequency: number): void {
    this.entity.sync_enabled = enabled;
    this.entity.sync_frequency = frequency;
    this.entity.updated_at = new Date();
  }
}

/**
 * Bridge factory functions to create wrapped entities
 */
export function wrapOrder(entity: PrintifyOrderType): PrintifyOrderType & PrintifyOrderBridge {
  const bridge = new PrintifyOrderBridge(entity);
  
  // Create a proxy that combines the entity data with bridge methods
  return new Proxy(entity, {
    get(target, prop) {
      // Check if the property exists on the bridge first
      if (prop in bridge) {
        const value = (bridge as any)[prop];
        return typeof value === 'function' ? value.bind(bridge) : value;
      }
      // Otherwise return from the entity
      return target[prop as keyof PrintifyOrderType];
    },
    
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    }
  }) as PrintifyOrderType & PrintifyOrderBridge;
}

export function wrapConfiguration(entity: PrintifyConfigurationType): PrintifyConfigurationType & PrintifyConfigurationBridge {
  const bridge = new PrintifyConfigurationBridge(entity);
  
  return new Proxy(entity, {
    get(target, prop) {
      if (prop in bridge) {
        const value = (bridge as any)[prop];
        return typeof value === 'function' ? value.bind(bridge) : value;
      }
      return target[prop as keyof PrintifyConfigurationType];
    },
    
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    }
  }) as PrintifyConfigurationType & PrintifyConfigurationBridge;
}