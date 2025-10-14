/**
 * Printify Cart Service
 * 
 * Manages Printify product integration with Medusa's cart system,
 * including pricing calculations, variant validation, and customization handling.
 */

import { PrintifyCartItem, PrintifyCartItemOptions } from '../models/printify-cart-item';
import { PrintifyProductVariant } from '../models/printify-product-variant';
import { StorefrontProductService } from './storefront-product-service';
import { PrintifyApiClient } from './printify-api-client';
import { logger } from '../utils/logger';
import { PrintifyPluginError, ErrorCode, ErrorSeverity } from '../utils/error-handling';

export interface AddToCartRequest {
  productId: string;
  variantId: string;
  quantity: number;
  options?: PrintifyCartItemOptions;
  customization?: {
    designId?: string;
    designUrl?: string;
    personalizationFields?: Record<string, string>;
  };
}

export interface CartItemUpdate {
  quantity?: number;
  options?: PrintifyCartItemOptions;
  customization?: {
    designId?: string;
    designUrl?: string;
    personalizationFields?: Record<string, string>;
  };
}

export interface CartSummary {
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  total: number;
  currency: string;
  formattedSubtotal: string;
  formattedTotal: string;
  formattedDiscount: string;
  formattedTax: string;
  items: PrintifyCartItem[];
  hasUnavailableItems: boolean;
  requiresCustomization: boolean;
}

export interface CartValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  unavailableItems: string[];
  itemsRequiringCustomization: string[];
}

export class PrintifyCartService {
  private storefrontService: StorefrontProductService;
  private apiClient: PrintifyApiClient;
  private cartItems: Map<string, PrintifyCartItem[]> = new Map(); // cartId -> items

  constructor(
    storefrontService: StorefrontProductService,
    apiClient: PrintifyApiClient
  ) {
    this.storefrontService = storefrontService;
    this.apiClient = apiClient;
  }

  /**
   * Add item to cart
   */
  async addToCart(
    cartId: string,
    request: AddToCartRequest
  ): Promise<PrintifyCartItem> {
    try {
      logger.info('Adding item to cart', {
        cartId,
        productId: request.productId,
        variantId: request.variantId,
        quantity: request.quantity,
      });

      // Validate product and variant
      const product = await this.storefrontService.getProduct(request.productId, true);
      if (!product) {
        throw new PrintifyPluginError(
          ErrorCode.PRODUCT_NOT_FOUND,
          'Product not found',
          ErrorSeverity.MEDIUM,
          { productId: request.productId }
        );
      }

      const variants = await this.storefrontService.getProductVariants(request.productId);
      const variant = variants.find(v => v.id === request.variantId);
      if (!variant) {
        throw new PrintifyPluginError(
          ErrorCode.PRODUCT_NOT_FOUND,
          'Product variant not found',
          ErrorSeverity.MEDIUM,
          { productId: request.productId, variantId: request.variantId }
        );
      }

      // Check availability
      if (!variant.isAvailableForPurchase()) {
        throw new PrintifyPluginError(
          ErrorCode.VALIDATION_ERROR,
          'Product variant is not available for purchase',
          ErrorSeverity.MEDIUM,
          { variantId: request.variantId }
        );
      }

      // Validate requested quantity
      const quantityValidation = variant.validateQuantity(request.quantity);
      if (!quantityValidation.isValid) {
        throw new PrintifyPluginError(
          ErrorCode.VALIDATION_ERROR,
          quantityValidation.reason || 'Invalid quantity',
          ErrorSeverity.MEDIUM,
          { variantId: request.variantId, requestedQuantity: request.quantity }
        );
      }

      // Create cart item
      const cartItem = PrintifyCartItem.fromVariant(
        cartId,
        request.productId,
        request.variantId,
        product.printify_product_id,
        variant.printifyVariantId,
        request.quantity,
        request.options || {},
        variant.price.amount,
        variant.price.currency
      );

      // Add customization if provided
      if (request.customization) {
        const customizationResult = await this.validateCustomization(
          request.customization,
          variant
        );
        
        cartItem.updateCustomization({
          ...request.customization,
          customizationValid: customizationResult.isValid,
          customizationErrors: customizationResult.errors,
        });
      }

      // Validate cart item
      const validation = cartItem.validate();
      if (!validation.isValid) {
        throw new PrintifyPluginError(
          ErrorCode.VALIDATION_ERROR,
          'Invalid cart item data',
          ErrorSeverity.MEDIUM,
          { errors: validation.errors }
        );
      }

      // Add to cart
      const currentItems = this.cartItems.get(cartId) || [];
      
      // Check if item with same configuration already exists
      const existingItemIndex = currentItems.findIndex(item =>
        item.productId === request.productId &&
        item.variantId === request.variantId &&
        this.optionsMatch(item.options, request.options || {})
      );

      if (existingItemIndex >= 0) {
        // Update quantity of existing item
        const existingItem = currentItems[existingItemIndex];
        if (!existingItem) {
          throw new PrintifyPluginError(
            ErrorCode.API_SERVER_ERROR,
            'Cart item reference error',
            ErrorSeverity.HIGH
          );
        }
        
        existingItem.updateQuantity(existingItem.quantity + request.quantity);
        
        // Reserve inventory
        if (variant.inventory.trackQuantity && variant.inventory.manageInventory) {
          const reserved = variant.reserveInventory(request.quantity);
          if (!reserved) {
            throw new PrintifyPluginError(
              ErrorCode.VALIDATION_ERROR,
              'Insufficient inventory for requested quantity',
              ErrorSeverity.MEDIUM,
              { 
                variantId: request.variantId,
                requestedQuantity: request.quantity,
                availableQuantity: variant.inventory.quantity || 0
              }
            );
          }
        }

        logger.info('Updated existing cart item quantity', {
          cartId,
          itemId: existingItem.id,
          newQuantity: existingItem.quantity,
        });

        return existingItem;
      } else {
        // Reserve inventory
        if (variant.inventory.trackQuantity && variant.inventory.manageInventory) {
          const reserved = variant.reserveInventory(request.quantity);
          if (!reserved) {
            throw new PrintifyPluginError(
              ErrorCode.VALIDATION_ERROR,
              'Insufficient inventory for requested quantity',
              ErrorSeverity.MEDIUM,
              { 
                variantId: request.variantId,
                requestedQuantity: request.quantity,
                availableQuantity: variant.inventory.quantity || 0
              }
            );
          }
        }

        // Add new item
        currentItems.push(cartItem);
        this.cartItems.set(cartId, currentItems);

        logger.info('Added new item to cart', {
          cartId,
          itemId: cartItem.id,
          productId: request.productId,
          variantId: request.variantId,
          quantity: request.quantity,
        });

        return cartItem;
      }
    } catch (error) {
      logger.error('Failed to add item to cart', error as Error, {
        cartId,
        request,
      });
      throw error;
    }
  }

  /**
   * Update cart item
   */
  async updateCartItem(
    cartId: string,
    itemId: string,
    updates: CartItemUpdate
  ): Promise<PrintifyCartItem> {
    try {
      logger.info('Updating cart item', {
        cartId,
        itemId,
        updates,
      });

      const cartItems = this.cartItems.get(cartId) || [];
      const itemIndex = cartItems.findIndex(item => item.id === itemId);

      if (itemIndex === -1) {
        throw new PrintifyPluginError(
          ErrorCode.ENTITY_NOT_FOUND,
          'Cart item not found',
          ErrorSeverity.MEDIUM,
          { cartId, itemId }
        );
      }

      const cartItem = cartItems[itemIndex];
      if (!cartItem) {
        throw new PrintifyPluginError(
          ErrorCode.API_SERVER_ERROR,
          'Cart item reference error',
          ErrorSeverity.HIGH
        );
      }

      // Update quantity if provided
      if (updates.quantity !== undefined) {
        if (updates.quantity <= 0) {
          // Remove item if quantity is 0 or negative
          await this.removeCartItem(cartId, itemId);
          throw new PrintifyPluginError(
            ErrorCode.VALIDATION_ERROR,
            'Item removed from cart',
            ErrorSeverity.LOW
          );
        }
        cartItem.updateQuantity(updates.quantity);
      }

      // Update options if provided
      if (updates.options) {
        cartItem.options = { ...cartItem.options, ...updates.options };
        cartItem.updatedAt = new Date();
      }

      // Update customization if provided
      if (updates.customization) {
        const variants = await this.storefrontService.getProductVariants(cartItem.productId);
        const variant = variants.find(v => v.id === cartItem.variantId);
        
        if (variant) {
          const customizationResult = await this.validateCustomization(
            updates.customization,
            variant
          );
          
          cartItem.updateCustomization({
            ...updates.customization,
            customizationValid: customizationResult.isValid,
            customizationErrors: customizationResult.errors,
          });
        }
      }

      logger.info('Successfully updated cart item', {
        cartId,
        itemId,
        newQuantity: cartItem.quantity,
      });

      return cartItem;
    } catch (error) {
      logger.error('Failed to update cart item', error as Error, {
        cartId,
        itemId,
        updates,
      });
      throw error;
    }
  }

  /**
   * Remove item from cart
   */
  async removeCartItem(cartId: string, itemId: string): Promise<void> {
    try {
      logger.info('Removing cart item', { cartId, itemId });

      const cartItems = this.cartItems.get(cartId) || [];
      const itemIndex = cartItems.findIndex(item => item.id === itemId);

      if (itemIndex === -1) {
        throw new PrintifyPluginError(
          ErrorCode.ENTITY_NOT_FOUND,
          'Cart item not found',
          ErrorSeverity.MEDIUM,
          { cartId, itemId }
        );
      }

      // Remove item
      cartItems.splice(itemIndex, 1);
      this.cartItems.set(cartId, cartItems);

      logger.info('Successfully removed cart item', { cartId, itemId });
    } catch (error) {
      logger.error('Failed to remove cart item', error as Error, {
        cartId,
        itemId,
      });
      throw error;
    }
  }

  /**
   * Get cart items
   */
  getCartItems(cartId: string): PrintifyCartItem[] {
    return this.cartItems.get(cartId) || [];
  }

  /**
   * Get cart summary
   */
  async getCartSummary(cartId: string): Promise<CartSummary> {
    try {
      const items = this.getCartItems(cartId);

      let subtotal = 0;
      let totalDiscount = 0;
      let totalTax = 0;
      let totalQuantity = 0;
      let hasUnavailableItems = false;
      let requiresCustomization = false;

      for (const item of items) {
        subtotal += item.pricing.totalPrice;
        totalQuantity += item.quantity;
        
        if (item.pricing.discountAmount) {
          totalDiscount += item.pricing.discountAmount;
        }
        
        if (item.pricing.taxAmount) {
          totalTax += item.pricing.taxAmount;
        }

        if (!item.isAvailable) {
          hasUnavailableItems = true;
        }

        if (item.requiresCustomization() && !item.customization?.customizationValid) {
          requiresCustomization = true;
        }
      }

      const total = subtotal - totalDiscount + totalTax;
      const firstItem = items[0];
      const currency = firstItem ? firstItem.pricing.currency : 'USD';

      const summary: CartSummary = {
        itemCount: items.length,
        totalQuantity,
        subtotal,
        totalDiscount,
        totalTax,
        total,
        currency,
        formattedSubtotal: this.formatPrice(subtotal, currency),
        formattedTotal: this.formatPrice(total, currency),
        formattedDiscount: this.formatPrice(totalDiscount, currency),
        formattedTax: this.formatPrice(totalTax, currency),
        items,
        hasUnavailableItems,
        requiresCustomization,
      };

      logger.info('Generated cart summary', {
        cartId,
        itemCount: summary.itemCount,
        totalQuantity: summary.totalQuantity,
        total: summary.total,
        currency: summary.currency,
      });

      return summary;
    } catch (error) {
      logger.error('Failed to generate cart summary', error as Error, { cartId });
      throw new PrintifyPluginError(
        ErrorCode.API_SERVER_ERROR,
        'Failed to generate cart summary',
        ErrorSeverity.MEDIUM,
        { cartId }
      );
    }
  }

  /**
   * Validate entire cart
   */
  async validateCart(cartId: string): Promise<CartValidationResult> {
    try {
      const items = this.getCartItems(cartId);
      const errors: string[] = [];
      const warnings: string[] = [];
      const unavailableItems: string[] = [];
      const itemsRequiringCustomization: string[] = [];

      for (const item of items) {
        // Validate individual item
        const itemValidation = item.validate();
        if (!itemValidation.isValid) {
          errors.push(...itemValidation.errors.map(error => `${item.getDisplayName()}: ${error}`));
        }

        // Check availability
        if (!item.isAvailable) {
          unavailableItems.push(item.getDisplayName());
        }

        // Check customization requirements
        if (item.requiresCustomization() && !item.customization?.customizationValid) {
          itemsRequiringCustomization.push(item.getDisplayName());
        }

        // Check inventory (this would integrate with real inventory system)
        if (item.quantity > 10) { // Example threshold
          warnings.push(`${item.getDisplayName()}: Large quantity may affect processing time`);
        }
      }

      if (items.length === 0) {
        errors.push('Cart is empty');
      }

      const result: CartValidationResult = {
        isValid: errors.length === 0 && unavailableItems.length === 0 && itemsRequiringCustomization.length === 0,
        errors,
        warnings,
        unavailableItems,
        itemsRequiringCustomization,
      };

      logger.info('Cart validation completed', {
        cartId,
        isValid: result.isValid,
        errorCount: errors.length,
        warningCount: warnings.length,
      });

      return result;
    } catch (error) {
      logger.error('Failed to validate cart', error as Error, { cartId });
      throw new PrintifyPluginError(
        ErrorCode.API_SERVER_ERROR,
        'Failed to validate cart',
        ErrorSeverity.MEDIUM,
        { cartId }
      );
    }
  }

  /**
   * Clear cart
   */
  clearCart(cartId: string): void {
    this.cartItems.delete(cartId);
    logger.info('Cart cleared', { cartId });
  }

  /**
   * Validate customization options
   */
  private async validateCustomization(
    customization: any,
    variant: PrintifyProductVariant
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Basic validation - in a real implementation this would be more sophisticated
    if (customization.designId && !customization.designUrl) {
      errors.push('Design URL is required when design ID is provided');
    }

    if (customization.personalizationFields) {
      for (const [field, value] of Object.entries(customization.personalizationFields)) {
        if (typeof value !== 'string' || !value.trim()) {
          errors.push(`Personalization field '${field}' must be a non-empty string`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if options match
   */
  private optionsMatch(options1: PrintifyCartItemOptions, options2: PrintifyCartItemOptions): boolean {
    const keys1 = Object.keys(options1).sort();
    const keys2 = Object.keys(options2).sort();

    if (keys1.length !== keys2.length) return false;
    if (keys1.join(',') !== keys2.join(',')) return false;

    return keys1.every(key => options1[key] === options2[key]);
  }

  /**
   * Format price as currency string
   */
  private formatPrice(priceInCents: number, currency: string): string {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    });
    return formatter.format(priceInCents / 100);
  }
}