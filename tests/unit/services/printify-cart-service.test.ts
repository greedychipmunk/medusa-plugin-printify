import { PrintifyCartService } from '../../../src/modules/printify/services/printify-cart-service';
import { StorefrontProductService } from '../../../src/modules/printify/services/storefront-product-service';
import { PrintifyApiClient } from '../../../src/modules/printify/services/printify-api-client';

describe('PrintifyCartService', () => {
  let cartService: PrintifyCartService;
  let mockStorefrontService: jest.Mocked<StorefrontProductService>;
  let mockApiClient: jest.Mocked<PrintifyApiClient>;

  beforeEach(() => {
    // Create mocks
    mockStorefrontService = {
      getProduct: jest.fn(),
      getProductVariants: jest.fn(),
      validateCustomization: jest.fn(),
    } as any;

    mockApiClient = {
      request: jest.fn(),
    } as any;

    cartService = new PrintifyCartService(mockStorefrontService, mockApiClient);
  });

  describe('cart operations', () => {
    it('should initialize with empty cart', async () => {
      const summary = await cartService.getCartSummary('test-cart');
      
      expect(summary.itemCount).toBe(0);
      expect(summary.totalQuantity).toBe(0);
      expect(summary.subtotal).toBe(0);
      expect(summary.total).toBe(0);
      expect(summary.currency).toBe('USD');
    });

    it('should add item to cart', async () => {
      // Mock product data
      mockStorefrontService.getProduct.mockResolvedValue({
        id: 'product-1',
        printify_product_id: 'printify-1',
        enabled: true,
      } as any);

      // Mock variant data
      const mockVariant = {
        id: 'variant-1',
        productId: 'product-1',
        printifyVariantId: 'printify-variant-1',
        price: {
          amount: 1999, // 19.99 in cents
          currency: 'USD',
        },
        inventory: {
          trackQuantity: true,
          quantity: 10,
          allowBackorder: false,
        },
        options: { size: 'M', color: 'Black' },
        isAvailableForPurchase: jest.fn().mockReturnValue(true),
        hasRequiredOptions: jest.fn().mockReturnValue(true),
        validateQuantity: jest.fn().mockReturnValue({ isValid: true }),
      } as any;

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant]);

      const cartItem = await cartService.addToCart('test-cart', {
        productId: 'product-1',
        variantId: 'variant-1',
        quantity: 2,
        options: { size: 'M', color: 'Black' },
      });

      expect(cartItem.productId).toBe('product-1');
      expect(cartItem.variantId).toBe('variant-1');
      expect(cartItem.quantity).toBe(2);
      expect(cartItem.pricing.unitPrice).toBe(1999); // Price in cents

      const summary = await cartService.getCartSummary('test-cart');
      expect(summary.itemCount).toBe(1);
      expect(summary.totalQuantity).toBe(2);
      expect(summary.subtotal).toBe(3998); // Total in cents (1999 * 2)
    });

    it('should get cart items', async () => {
      // First add an item (using the previous setup)
      mockStorefrontService.getProduct.mockResolvedValue({
        id: 'product-1',
        printify_product_id: 'printify-1',
        enabled: true,
      } as any);

      const mockVariant = {
        id: 'variant-1',
        productId: 'product-1',
        printifyVariantId: 'printify-variant-1',
        price: {
          amount: 1999, // 19.99 in cents
          currency: 'USD',
        },
        inventory: {
          trackQuantity: true,
          quantity: 10,
          allowBackorder: false,
        },
        options: { size: 'M' },
        isAvailableForPurchase: jest.fn().mockReturnValue(true),
        hasRequiredOptions: jest.fn().mockReturnValue(true),
        validateQuantity: jest.fn().mockReturnValue({ isValid: true }),
      } as any;

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant]);

      await cartService.addToCart('test-cart', {
        productId: 'product-1',
        variantId: 'variant-1',
        quantity: 1,
      });

      const items = await cartService.getCartItems('test-cart');
      expect(items).toHaveLength(1);
      expect(items[0].productId).toBe('product-1');
    });

    it('should clear cart', async () => {
      // Add an item first
      mockStorefrontService.getProduct.mockResolvedValue({
        id: 'product-1',
        printify_product_id: 'printify-1',
        enabled: true,
      } as any);

      const mockVariant = {
        id: 'variant-1',
        productId: 'product-1',
        printifyVariantId: 'printify-variant-1',
        price: {
          amount: 1999, // 19.99 in cents
          currency: 'USD',
        },
        inventory: {
          trackQuantity: true,
          quantity: 10,
          allowBackorder: false,
        },
        options: { size: 'M' },
        isAvailableForPurchase: jest.fn().mockReturnValue(true),
        hasRequiredOptions: jest.fn().mockReturnValue(true),
        validateQuantity: jest.fn().mockReturnValue({ isValid: true }),
      } as any;

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant]);

      await cartService.addToCart('test-cart', {
        productId: 'product-1',
        variantId: 'variant-1',
        quantity: 1,
      });

      // Verify item was added
      let items = await cartService.getCartItems('test-cart');
      expect(items).toHaveLength(1);

      // Clear cart
      await cartService.clearCart('test-cart');

      // Verify cart is empty
      items = await cartService.getCartItems('test-cart');
      expect(items).toHaveLength(0);

      const summary = await cartService.getCartSummary('test-cart');
      expect(summary.itemCount).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle invalid variant', async () => {
      mockStorefrontService.getProduct.mockResolvedValue(null);
      mockStorefrontService.getProductVariants.mockResolvedValue([]);

      await expect(cartService.addToCart('test-cart', {
        productId: 'invalid-product',
        variantId: 'invalid-variant',
        quantity: 1,
      })).rejects.toThrow('Product not found');
    });

    it('should handle insufficient stock', async () => {
      mockStorefrontService.getProduct.mockResolvedValue({
        id: 'product-1',
        printify_product_id: 'printify-1',
        enabled: true,
      } as any);

      const mockVariant = {
        id: 'variant-1',
        productId: 'product-1',
        printifyVariantId: 'printify-variant-1',
        price: {
          amount: 1999, // 19.99 in cents
          currency: 'USD',
        },
        inventory: {
          trackQuantity: true,
          quantity: 2,
          allowBackorder: false,
        },
        options: { size: 'M' },
        isAvailableForPurchase: jest.fn().mockReturnValue(true),
        hasRequiredOptions: jest.fn().mockReturnValue(true),
        validateQuantity: jest.fn().mockReturnValue({ isValid: false, reason: 'Insufficient stock' }),
      } as any;

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant]);

      await expect(cartService.addToCart('test-cart', {
        productId: 'product-1',
        variantId: 'variant-1',
        quantity: 5, // More than available stock
      })).rejects.toThrow('Insufficient stock');
    });
  });
});