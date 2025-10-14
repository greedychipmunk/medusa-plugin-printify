/**
 * Printify Order Model
 * 
 * Represents orders submitted to Printify for fulfillment,
 * including order items, shipping details, and status tracking.
 */

import { PrintifyCartItem } from './printify-cart-item';

export interface PrintifyOrderShippingAddress {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  zip: string;
  country: string;
}

export interface PrintifyOrderItem {
  productId: string;
  variantId: string;
  printifyProductId: string;
  printifyVariantId: string;
  quantity: number;
  unitPrice: number; // Price in cents
  totalPrice: number; // Total price in cents
  options: Record<string, any>;
  customization?: {
    designId?: string;
    designUrl?: string;
    personalizationFields?: Record<string, string>;
  };
}

export interface PrintifyOrderPricing {
  subtotal: number; // In cents
  shippingCost: number; // In cents
  taxAmount: number; // In cents
  discountAmount: number; // In cents
  total: number; // In cents
  currency: string;
}

export interface PrintifyOrderTracking {
  trackingNumber?: string;
  trackingUrl?: string;
  carrier?: string;
  shippedAt?: Date;
  estimatedDelivery?: Date;
}

export enum PrintifyOrderStatus {
  PENDING = 'pending',
  VALIDATED = 'validated',
  SUBMITTED = 'submitted',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export interface PrintifyOrderStatusHistory {
  status: PrintifyOrderStatus;
  timestamp: Date;
  note?: string;
  printifyOrderId?: string;
}

export class PrintifyOrder {
  id: string;
  medusaOrderId: string;
  printifyOrderId?: string;
  customerId?: string;
  customerEmail: string;
  
  // Order details
  items: PrintifyOrderItem[];
  shippingAddress: PrintifyOrderShippingAddress;
  pricing: PrintifyOrderPricing;
  
  // Status and tracking
  status: PrintifyOrderStatus;
  statusHistory: PrintifyOrderStatusHistory[];
  tracking?: PrintifyOrderTracking;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  
  // Error handling
  lastError?: string;
  retryCount: number;
  maxRetries: number;

  constructor(data: Partial<PrintifyOrder>) {
    this.id = data.id || this.generateId();
    this.medusaOrderId = data.medusaOrderId || '';
    this.printifyOrderId = data.printifyOrderId;
    this.customerId = data.customerId;
    this.customerEmail = data.customerEmail || '';
    
    this.items = data.items || [];
    this.shippingAddress = data.shippingAddress || {} as PrintifyOrderShippingAddress;
    this.pricing = data.pricing || {
      subtotal: 0,
      shippingCost: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: 0,
      currency: 'USD',
    };
    
    this.status = data.status || PrintifyOrderStatus.PENDING;
    this.statusHistory = data.statusHistory || [];
    this.tracking = data.tracking;
    
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.submittedAt = data.submittedAt;
    
    this.lastError = data.lastError;
    this.retryCount = data.retryCount || 0;
    this.maxRetries = data.maxRetries || 3;

    // Initialize status history if empty
    if (this.statusHistory.length === 0) {
      this.statusHistory.push({
        status: this.status,
        timestamp: this.createdAt,
        note: 'Order created',
      });
    }
  }

  /**
   * Generate unique ID for order
   */
  private generateId(): string {
    return `printify_order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add item to order
   */
  addItem(item: PrintifyOrderItem): void {
    this.items.push(item);
    this.recalculatePricing();
    this.updatedAt = new Date();
  }

  /**
   * Remove item from order
   */
  removeItem(productId: string, variantId: string): boolean {
    const initialLength = this.items.length;
    this.items = this.items.filter(item => 
      !(item.productId === productId && item.variantId === variantId)
    );
    
    if (this.items.length !== initialLength) {
      this.recalculatePricing();
      this.updatedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * Update order status
   */
  updateStatus(status: PrintifyOrderStatus, note?: string, printifyOrderId?: string): void {
    if (this.status === status) return;

    const previousStatus = this.status;
    this.status = status;
    this.updatedAt = new Date();

    this.statusHistory.push({
      status,
      timestamp: this.updatedAt,
      note,
      printifyOrderId,
    });

    // Set submitted timestamp when order is submitted
    if (status === PrintifyOrderStatus.SUBMITTED && !this.submittedAt) {
      this.submittedAt = this.updatedAt;
    }

    // Set printify order ID if provided
    if (printifyOrderId && !this.printifyOrderId) {
      this.printifyOrderId = printifyOrderId;
    }
  }

  /**
   * Update tracking information
   */
  updateTracking(tracking: Partial<PrintifyOrderTracking>): void {
    this.tracking = { ...this.tracking, ...tracking };
    this.updatedAt = new Date();

    // Update status to shipped if tracking number is provided
    if (tracking.trackingNumber && this.status === PrintifyOrderStatus.PROCESSING) {
      this.updateStatus(PrintifyOrderStatus.SHIPPED, 'Order shipped with tracking');
    }
  }

  /**
   * Set error information
   */
  setError(error: string): void {
    this.lastError = error;
    this.retryCount += 1;
    this.updatedAt = new Date();

    // Update status to failed if max retries exceeded
    if (this.retryCount >= this.maxRetries) {
      this.updateStatus(PrintifyOrderStatus.FAILED, `Failed after ${this.retryCount} retries: ${error}`);
    }
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.lastError = undefined;
    this.updatedAt = new Date();
  }

  /**
   * Reset retry count
   */
  resetRetries(): void {
    this.retryCount = 0;
    this.updatedAt = new Date();
  }

  /**
   * Check if order can be submitted to Printify
   */
  canSubmit(): boolean {
    return (
      this.status === PrintifyOrderStatus.PENDING ||
      this.status === PrintifyOrderStatus.VALIDATED
    ) &&
    this.items.length > 0 &&
    this.isValidShippingAddress() &&
    this.retryCount < this.maxRetries;
  }

  /**
   * Check if order can be cancelled
   */
  canCancel(): boolean {
    return (
      this.status === PrintifyOrderStatus.PENDING ||
      this.status === PrintifyOrderStatus.VALIDATED ||
      this.status === PrintifyOrderStatus.SUBMITTED
    );
  }

  /**
   * Check if order is in final state
   */
  isFinalStatus(): boolean {
    return [
      PrintifyOrderStatus.DELIVERED,
      PrintifyOrderStatus.CANCELLED,
      PrintifyOrderStatus.FAILED,
    ].includes(this.status);
  }

  /**
   * Validate shipping address
   */
  private isValidShippingAddress(): boolean {
    const addr = this.shippingAddress;
    return !!(
      addr.firstName &&
      addr.lastName &&
      addr.email &&
      addr.address1 &&
      addr.city &&
      addr.zip &&
      addr.country
    );
  }

  /**
   * Recalculate order pricing
   */
  private recalculatePricing(): void {
    const subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
    
    this.pricing.subtotal = subtotal;
    this.pricing.total = subtotal + this.pricing.shippingCost + this.pricing.taxAmount - this.pricing.discountAmount;
  }

  /**
   * Get formatted total price
   */
  getFormattedTotal(): string {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.pricing.currency,
    });
    return formatter.format(this.pricing.total / 100);
  }

  /**
   * Get order duration in hours
   */
  getOrderDuration(): number {
    const endTime = this.submittedAt || this.updatedAt;
    return Math.round((endTime.getTime() - this.createdAt.getTime()) / (1000 * 60 * 60));
  }

  /**
   * Convert cart items to order items
   */
  static fromCartItems(cartItems: PrintifyCartItem[], medusaOrderId: string, customerInfo: {
    customerId?: string;
    email: string;
    shippingAddress: PrintifyOrderShippingAddress;
  }): PrintifyOrder {
    const orderItems: PrintifyOrderItem[] = cartItems.map(cartItem => ({
      productId: cartItem.productId,
      variantId: cartItem.variantId,
      printifyProductId: cartItem.printifyProductId,
      printifyVariantId: cartItem.printifyVariantId,
      quantity: cartItem.quantity,
      unitPrice: cartItem.pricing.unitPrice,
      totalPrice: cartItem.pricing.totalPrice,
      options: cartItem.options,
      customization: cartItem.customization,
    }));

    const subtotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);

    return new PrintifyOrder({
      medusaOrderId,
      customerId: customerInfo.customerId,
      customerEmail: customerInfo.email,
      items: orderItems,
      shippingAddress: customerInfo.shippingAddress,
      pricing: {
        subtotal,
        shippingCost: 0, // To be calculated
        taxAmount: 0, // To be calculated
        discountAmount: 0,
        total: subtotal,
        currency: 'USD',
      },
    });
  }

  /**
   * Validate order data
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.medusaOrderId) {
      errors.push('Medusa order ID is required');
    }

    if (!this.customerEmail || !this.customerEmail.includes('@')) {
      errors.push('Valid customer email is required');
    }

    if (this.items.length === 0) {
      errors.push('Order must have at least one item');
    }

    if (!this.isValidShippingAddress()) {
      errors.push('Complete shipping address is required');
    }

    if (this.pricing.total <= 0) {
      errors.push('Order total must be greater than zero');
    }

    // Validate items
    this.items.forEach((item, index) => {
      if (!item.printifyProductId) {
        errors.push(`Item ${index + 1}: Printify product ID is required`);
      }
      if (!item.printifyVariantId) {
        errors.push(`Item ${index + 1}: Printify variant ID is required`);
      }
      if (item.quantity <= 0) {
        errors.push(`Item ${index + 1}: Quantity must be greater than zero`);
      }
      if (item.unitPrice <= 0) {
        errors.push(`Item ${index + 1}: Unit price must be greater than zero`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Convert to JSON for API submission
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      medusaOrderId: this.medusaOrderId,
      printifyOrderId: this.printifyOrderId,
      customerId: this.customerId,
      customerEmail: this.customerEmail,
      items: this.items,
      shippingAddress: this.shippingAddress,
      pricing: this.pricing,
      status: this.status,
      statusHistory: this.statusHistory,
      tracking: this.tracking,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      submittedAt: this.submittedAt?.toISOString(),
      lastError: this.lastError,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
    };
  }
}