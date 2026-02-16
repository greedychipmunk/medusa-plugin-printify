import PrintifyModuleService from '../../../src/modules/printify/service';
import { PrintifyCartItem } from '../../../src/modules/printify/models/printify-cart-item';

// Mock the MedusaService factory so we can instantiate without a real DB
jest.mock('@medusajs/framework/utils', () => {
  return {
    MedusaService: () => class MockBase {},
    model: {
      define: jest.fn().mockReturnValue({}),
      id: jest.fn().mockReturnValue({ primaryKey: jest.fn() }),
      text: jest.fn().mockReturnValue({ nullable: jest.fn(), unique: jest.fn(), default: jest.fn() }),
      boolean: jest.fn().mockReturnValue({ default: jest.fn() }),
      number: jest.fn().mockReturnValue({ default: jest.fn() }),
      json: jest.fn().mockReturnValue({ nullable: jest.fn() }),
      dateTime: jest.fn().mockReturnValue({ nullable: jest.fn() }),
    },
    Module: jest.fn(),
  };
});

describe('PrintifyCartService (via PrintifyModuleService)', () => {
  let service: any;

  const createMockCartItem = (overrides: Partial<{
    productId: string;
    variantId: string;
    quantity: number;
    unitPrice: number;
  }> = {}): PrintifyCartItem => {
    const {
      productId = 'product-1',
      variantId = 'variant-1',
      quantity = 2,
      unitPrice = 1999,
    } = overrides;

    return PrintifyCartItem.fromVariant(
      'test-cart',
      productId,
      variantId,
      `printify-${productId}`,
      `printify-${variantId}`,
      quantity,
      { size: 'M', color: 'Black' },
      unitPrice,
      'USD'
    );
  };

  beforeEach(() => {
    service = new PrintifyModuleService({} as any, {} as any);
  });

  describe('cart operations', () => {
    it('should initialize with empty cart', async () => {
      const summary = await service.getCartSummary('test-cart');

      expect(summary.itemCount).toBe(0);
      expect(summary.totalQuantity).toBe(0);
      expect(summary.subtotal).toBe(0);
      expect(summary.total).toBe(0);
      expect(summary.currency).toBe('USD');
    });

    it('should add item to cart', async () => {
      const cartItem = createMockCartItem();
      const added = service.addToCart('test-cart', cartItem);

      expect(added.productId).toBe('product-1');
      expect(added.variantId).toBe('variant-1');
      expect(added.quantity).toBe(2);
      expect(added.pricing.unitPrice).toBe(1999);

      const summary = await service.getCartSummary('test-cart');
      expect(summary.itemCount).toBe(1);
      expect(summary.totalQuantity).toBe(2);
      expect(summary.subtotal).toBe(3998); // 1999 * 2
    });

    it('should get cart items', () => {
      const cartItem = createMockCartItem({ quantity: 1 });
      service.addToCart('test-cart', cartItem);

      const items = service.getCartItems('test-cart');
      expect(items).toHaveLength(1);
      expect(items[0].productId).toBe('product-1');
    });

    it('should clear cart', async () => {
      const cartItem = createMockCartItem({ quantity: 1 });
      service.addToCart('test-cart', cartItem);

      // Verify item was added
      let items = service.getCartItems('test-cart');
      expect(items).toHaveLength(1);

      // Clear cart
      service.clearCart('test-cart');

      // Verify cart is empty
      items = service.getCartItems('test-cart');
      expect(items).toHaveLength(0);

      const summary = await service.getCartSummary('test-cart');
      expect(summary.itemCount).toBe(0);
    });
  });

  describe('cart summary', () => {
    it('should calculate totals with multiple items', async () => {
      service.addToCart('test-cart', createMockCartItem({ productId: 'p1', variantId: 'v1', quantity: 1, unitPrice: 1000 }));
      service.addToCart('test-cart', createMockCartItem({ productId: 'p2', variantId: 'v2', quantity: 3, unitPrice: 500 }));

      const summary = await service.getCartSummary('test-cart');

      expect(summary.itemCount).toBe(2);
      expect(summary.totalQuantity).toBe(4); // 1 + 3
      expect(summary.subtotal).toBe(2500); // 1000 + 1500
      expect(summary.total).toBe(2500);
      expect(summary.currency).toBe('USD');
    });

    it('should isolate carts by ID', async () => {
      service.addToCart('cart-a', createMockCartItem({ quantity: 1 }));
      service.addToCart('cart-b', createMockCartItem({ quantity: 2 }));
      service.addToCart('cart-b', createMockCartItem({ productId: 'p2', variantId: 'v2', quantity: 1 }));

      const summaryA = await service.getCartSummary('cart-a');
      const summaryB = await service.getCartSummary('cart-b');

      expect(summaryA.itemCount).toBe(1);
      expect(summaryB.itemCount).toBe(2);
    });
  });
});
