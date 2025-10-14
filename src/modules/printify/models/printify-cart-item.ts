/**
 * Printify Cart Item Model
 * 
 * Represents a Printify product variant in a shopping cart,
 * with pricing, customization options, and validation.
 */

export interface PrintifyCartItemOptions {
  color?: string;
  size?: string;
  design?: string;
  personalization?: Record<string, any>;
  [key: string]: any;
}

export interface PrintifyCartItemPricing {
  unitPrice: number; // Price per item in cents
  totalPrice: number; // Total price for quantity in cents
  currency: string;
  discountAmount?: number;
  taxAmount?: number;
  compareAtPrice?: number; // Original price if on sale
}

export interface PrintifyCartItemCustomization {
  designId?: string;
  designUrl?: string;
  personalizationFields?: Record<string, string>;
  previewImageUrl?: string;
  customizationValid: boolean;
  customizationErrors?: string[];
}

export class PrintifyCartItem {
  id: string;
  cartId: string;
  productId: string;
  variantId: string;
  printifyProductId: string;
  printifyVariantId: string;
  quantity: number;
  options: PrintifyCartItemOptions;
  pricing: PrintifyCartItemPricing;
  customization?: PrintifyCartItemCustomization;
  isAvailable: boolean;
  addedAt: Date;
  updatedAt: Date;

  constructor(data: Partial<PrintifyCartItem>) {
    this.id = data.id || this.generateId();
    this.cartId = data.cartId || '';
    this.productId = data.productId || '';
    this.variantId = data.variantId || '';
    this.printifyProductId = data.printifyProductId || '';
    this.printifyVariantId = data.printifyVariantId || '';
    this.quantity = Math.max(1, data.quantity || 1);
    this.options = data.options || {};
    this.pricing = data.pricing || {
      unitPrice: 0,
      totalPrice: 0,
      currency: 'USD',
    };
    this.customization = data.customization;
    this.isAvailable = data.isAvailable ?? true;
    this.addedAt = data.addedAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Generate unique cart item ID
   */
  private generateId(): string {
    return `pci_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update quantity and recalculate pricing
   */
  updateQuantity(newQuantity: number): void {
    const oldQuantity = this.quantity;
    this.quantity = Math.max(1, newQuantity);
    
    // Recalculate total price
    this.pricing.totalPrice = this.pricing.unitPrice * this.quantity;
    
    if (this.pricing.taxAmount) {
      this.pricing.taxAmount = (this.pricing.taxAmount / oldQuantity) * this.quantity;
    }
    
    this.updatedAt = new Date();
  }

  /**
   * Update pricing information
   */
  updatePricing(pricing: Partial<PrintifyCartItemPricing>): void {
    this.pricing = {
      ...this.pricing,
      ...pricing,
      totalPrice: (pricing.unitPrice || this.pricing.unitPrice) * this.quantity,
    };
    this.updatedAt = new Date();
  }

  /**
   * Update customization
   */
  updateCustomization(customization: PrintifyCartItemCustomization): void {
    this.customization = customization;
    this.updatedAt = new Date();
  }

  /**
   * Check if item can be added to cart
   */
  canAddToCart(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.isAvailable) {
      errors.push('Product variant is not available');
    }

    if (this.quantity <= 0) {
      errors.push('Quantity must be greater than 0');
    }

    if (this.pricing.unitPrice <= 0) {
      errors.push('Invalid pricing information');
    }

    if (this.customization && !this.customization.customizationValid) {
      errors.push(...(this.customization.customizationErrors || ['Invalid customization']));
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get formatted unit price
   */
  getFormattedUnitPrice(): string {
    return this.formatPrice(this.pricing.unitPrice);
  }

  /**
   * Get formatted total price
   */
  getFormattedTotalPrice(): string {
    return this.formatPrice(this.pricing.totalPrice);
  }

  /**
   * Get formatted compare at price
   */
  getFormattedCompareAtPrice(): string | null {
    if (!this.pricing.compareAtPrice) return null;
    return this.formatPrice(this.pricing.compareAtPrice);
  }

  /**
   * Check if item is on sale
   */
  isOnSale(): boolean {
    return !!(this.pricing.compareAtPrice && this.pricing.compareAtPrice > this.pricing.unitPrice);
  }

  /**
   * Get sale percentage
   */
  getSalePercentage(): number | null {
    if (!this.isOnSale() || !this.pricing.compareAtPrice) return null;
    
    const savings = this.pricing.compareAtPrice - this.pricing.unitPrice;
    return Math.round((savings / this.pricing.compareAtPrice) * 100);
  }

  /**
   * Get savings amount
   */
  getSavingsAmount(): number {
    if (!this.isOnSale() || !this.pricing.compareAtPrice) return 0;
    return (this.pricing.compareAtPrice - this.pricing.unitPrice) * this.quantity;
  }

  /**
   * Get formatted savings amount
   */
  getFormattedSavingsAmount(): string {
    return this.formatPrice(this.getSavingsAmount());
  }

  /**
   * Get display name for cart
   */
  getDisplayName(): string {
    const options = Object.entries(this.options)
      .filter(([_, value]) => value)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    
    return options ? `${this.productId} (${options})` : this.productId;
  }

  /**
   * Get weight for shipping calculations
   */
  getTotalWeight(): number {
    // This would typically come from the variant data
    // For now, return a default weight per item
    const defaultWeight = 100; // grams
    return defaultWeight * this.quantity;
  }

  /**
   * Check if customization is required
   */
  requiresCustomization(): boolean {
    // This would be determined by the product configuration
    return !!(this.options.design || this.options.personalization);
  }

  /**
   * Validate cart item data
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.cartId) {
      errors.push('Cart ID is required');
    }

    if (!this.productId) {
      errors.push('Product ID is required');
    }

    if (!this.variantId) {
      errors.push('Variant ID is required');
    }

    if (!this.printifyProductId) {
      errors.push('Printify product ID is required');
    }

    if (!this.printifyVariantId) {
      errors.push('Printify variant ID is required');
    }

    if (this.quantity <= 0) {
      errors.push('Quantity must be greater than 0');
    }

    if (this.pricing.unitPrice < 0) {
      errors.push('Unit price cannot be negative');
    }

    if (!this.pricing.currency) {
      errors.push('Currency is required');
    }

    if (this.requiresCustomization() && !this.customization) {
      errors.push('Customization is required for this product');
    }

    if (this.customization && !this.customization.customizationValid) {
      errors.push('Invalid customization');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Convert to plain object for API responses
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      cartId: this.cartId,
      productId: this.productId,
      variantId: this.variantId,
      printifyProductId: this.printifyProductId,
      printifyVariantId: this.printifyVariantId,
      quantity: this.quantity,
      options: this.options,
      pricing: {
        ...this.pricing,
        formattedUnitPrice: this.getFormattedUnitPrice(),
        formattedTotalPrice: this.getFormattedTotalPrice(),
        formattedCompareAtPrice: this.getFormattedCompareAtPrice(),
        isOnSale: this.isOnSale(),
        salePercentage: this.getSalePercentage(),
        savingsAmount: this.getSavingsAmount(),
        formattedSavingsAmount: this.getFormattedSavingsAmount(),
      },
      customization: this.customization,
      isAvailable: this.isAvailable,
      displayName: this.getDisplayName(),
      totalWeight: this.getTotalWeight(),
      requiresCustomization: this.requiresCustomization(),
      canAddToCart: this.canAddToCart(),
      addedAt: this.addedAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  /**
   * Create cart item from product variant
   */
  static fromVariant(
    cartId: string,
    productId: string,
    variantId: string,
    printifyProductId: string,
    printifyVariantId: string,
    quantity: number,
    options: PrintifyCartItemOptions = {},
    unitPrice: number,
    currency = 'USD'
  ): PrintifyCartItem {
    return new PrintifyCartItem({
      cartId,
      productId,
      variantId,
      printifyProductId,
      printifyVariantId,
      quantity,
      options,
      pricing: {
        unitPrice,
        totalPrice: unitPrice * quantity,
        currency,
      },
    });
  }

  /**
   * Format price as currency string
   */
  private formatPrice(priceInCents: number): string {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.pricing.currency,
    });
    return formatter.format(priceInCents / 100);
  }
}