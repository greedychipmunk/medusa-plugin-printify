/**
 * Printify Product Variant Model
 * 
 * Represents individual variants of Printify products (different sizes, colors, etc.)
 * for storefront display and shopping cart functionality.
 */

export interface PrintifyProductVariantOptions {
  color?: string;
  size?: string;
  [key: string]: string | undefined;
}

export interface PrintifyProductVariantPrice {
  amount: number;
  currency: string;
  compareAtAmount?: number;
}

export interface PrintifyProductVariantImage {
  id: string;
  url: string;
  alt?: string;
  position: number;
}

export interface PrintifyProductVariantInventory {
  trackQuantity: boolean;
  quantity?: number;
  allowBackorder: boolean;
  manageInventory: boolean;
}

export class PrintifyProductVariant {
  id: string;
  printifyVariantId: string;
  productId: string;
  title: string;
  sku: string;
  options: PrintifyProductVariantOptions;
  price: PrintifyProductVariantPrice;
  images: PrintifyProductVariantImage[];
  inventory: PrintifyProductVariantInventory;
  weight?: number;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    unit: 'cm' | 'in';
  };
  isAvailable: boolean;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Partial<PrintifyProductVariant>) {
    this.id = data.id || '';
    this.printifyVariantId = data.printifyVariantId || '';
    this.productId = data.productId || '';
    this.title = data.title || '';
    this.sku = data.sku || '';
    this.options = data.options || {};
    this.price = data.price || { amount: 0, currency: 'USD' };
    this.images = data.images || [];
    this.inventory = data.inventory || {
      trackQuantity: false,
      allowBackorder: true,
      manageInventory: false,
    };
    this.weight = data.weight;
    this.dimensions = data.dimensions;
    this.isAvailable = data.isAvailable ?? true;
    this.isEnabled = data.isEnabled ?? true;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Get formatted price string
   */
  getFormattedPrice(): string {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.price.currency,
    });
    return formatter.format(this.price.amount / 100); // Assuming price is in cents
  }

  /**
   * Get formatted compare at price string
   */
  getFormattedCompareAtPrice(): string | null {
    if (!this.price.compareAtAmount) return null;
    
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.price.currency,
    });
    return formatter.format(this.price.compareAtAmount / 100);
  }

  /**
   * Check if variant is on sale
   */
  isOnSale(): boolean {
    return !!(this.price.compareAtAmount && this.price.compareAtAmount > this.price.amount);
  }

  /**
   * Get sale percentage
   */
  getSalePercentage(): number | null {
    if (!this.isOnSale() || !this.price.compareAtAmount) return null;
    
    const savings = this.price.compareAtAmount - this.price.amount;
    return Math.round((savings / this.price.compareAtAmount) * 100);
  }

  /**
   * Check if variant is available for purchase
   */
  isAvailableForPurchase(): boolean {
    if (!this.isAvailable || !this.isEnabled) return false;
    
    if (this.inventory.trackQuantity && this.inventory.manageInventory) {
      if (!this.inventory.allowBackorder && (this.inventory.quantity || 0) <= 0) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get variant option display string
   */
  getOptionDisplayString(): string {
    const optionValues = Object.entries(this.options)
      .filter(([_, value]) => value)
      .map(([key, value]) => `${key}: ${value}`);
    
    return optionValues.join(', ') || 'Default';
  }

  /**
   * Get primary image
   */
  getPrimaryImage(): PrintifyProductVariantImage | null {
    return this.images.find(img => img.position === 0) || this.images[0] || null;
  }

  /**
   * Validates if the requested quantity is available for this variant
   */
  validateQuantity(requestedQuantity: number): { isValid: boolean; reason?: string } {
    if (!this.isAvailable) {
      return { isValid: false, reason: 'Variant is not available' };
    }
    
    if (requestedQuantity <= 0) {
      return { isValid: false, reason: 'Quantity must be greater than 0' };
    }
    
    // Check if variant is available for purchase
    if (!this.isAvailableForPurchase()) {
      return { isValid: false, reason: 'Variant is not available for purchase' };
    }
    
    // Check against inventory if quantity tracking is enabled
    if (this.inventory.trackQuantity && this.inventory.manageInventory) {
      const availableQuantity = this.inventory.quantity || 0;
      if (!this.inventory.allowBackorder && requestedQuantity > availableQuantity) {
        return { 
          isValid: false, 
          reason: `Requested quantity (${requestedQuantity}) exceeds available stock (${availableQuantity})` 
        };
      }
    }
    
    return { isValid: true };
  }

  /**
   * Update inventory quantity
   */
  updateInventoryQuantity(quantity: number): void {
    if (this.inventory.trackQuantity && this.inventory.manageInventory) {
      this.inventory.quantity = Math.max(0, quantity);
      this.updatedAt = new Date();
    }
  }

  /**
   * Reserve inventory for purchase
   */
  reserveInventory(quantity: number): boolean {
    if (!this.isAvailableForPurchase()) return false;
    
    if (this.inventory.trackQuantity && this.inventory.manageInventory) {
      const currentQuantity = this.inventory.quantity || 0;
      if (currentQuantity >= quantity) {
        this.inventory.quantity = currentQuantity - quantity;
        this.updatedAt = new Date();
        return true;
      } else if (this.inventory.allowBackorder) {
        this.inventory.quantity = 0;
        this.updatedAt = new Date();
        return true;
      }
      return false;
    }
    
    return true; // If not tracking inventory, always allow
  }

  /**
   * Validate variant data
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.printifyVariantId) {
      errors.push('Printify variant ID is required');
    }

    if (!this.productId) {
      errors.push('Product ID is required');
    }

    if (!this.title) {
      errors.push('Title is required');
    }

    if (!this.sku) {
      errors.push('SKU is required');
    }

    if (this.price.amount < 0) {
      errors.push('Price amount must be non-negative');
    }

    if (!this.price.currency) {
      errors.push('Price currency is required');
    }

    if (this.weight && this.weight < 0) {
      errors.push('Weight must be non-negative');
    }

    if (this.inventory.trackQuantity && this.inventory.quantity !== undefined && this.inventory.quantity < 0) {
      errors.push('Inventory quantity must be non-negative');
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
      printifyVariantId: this.printifyVariantId,
      productId: this.productId,
      title: this.title,
      sku: this.sku,
      options: this.options,
      price: {
        ...this.price,
        formatted: this.getFormattedPrice(),
        compareAtFormatted: this.getFormattedCompareAtPrice(),
        isOnSale: this.isOnSale(),
        salePercentage: this.getSalePercentage(),
      },
      images: this.images,
      inventory: this.inventory,
      weight: this.weight,
      dimensions: this.dimensions,
      isAvailable: this.isAvailable,
      isEnabled: this.isEnabled,
      isAvailableForPurchase: this.isAvailableForPurchase(),
      optionDisplayString: this.getOptionDisplayString(),
      primaryImage: this.getPrimaryImage(),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}