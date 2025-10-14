import { PrintifyOrderService, CreateOrderRequest } from '../../../src/modules/printify/services/printify-order-service';
import { StorefrontProductService } from '../../../src/modules/printify/services/storefront-product-service';
import { PrintifyApiClient } from '../../../src/modules/printify/services/printify-api-client';
import { PrintifyOrder, PrintifyOrderStatus } from '../../../src/modules/printify/models/printify-order';
import { PrintifyCartItem } from '../../../src/modules/printify/models/printify-cart-item';
import { PrintifyProductVariant } from '../../../src/modules/printify/models/printify-product-variant';
import { PrintifyPluginError } from '../../../src/modules/printify/utils/error-handling';

describe('PrintifyOrderService', () => {
  let orderService: PrintifyOrderService;
  let mockApiClient: jest.Mocked<PrintifyApiClient>;
  let mockStorefrontService: jest.Mocked<StorefrontProductService>;

  const mockShippingAddress = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    address1: '123 Main St',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    country: 'US',
  };

  const createMockCartItem = (): PrintifyCartItem => {
    return PrintifyCartItem.fromVariant(
      'test-cart',
      'product-1',
      'variant-1',
      'printify-product-1',
      'printify-variant-1',
      2,
      { size: 'M', color: 'Black' },
      1999,
      'USD'
    );
  };

  const createMockVariant = (): Partial<PrintifyProductVariant> => {
    return {
      id: 'variant-1',
      printifyVariantId: 'printify-variant-1',
      validateQuantity: jest.fn().mockReturnValue({ isValid: true }),
      isAvailableForPurchase: jest.fn().mockReturnValue(true),
    };
  };

  beforeEach(() => {
    // Create mocks
    mockApiClient = {
      createOrder: jest.fn(),
      getOrder: jest.fn(),
      cancelOrder: jest.fn(),
    } as any;

    mockStorefrontService = {
      getProduct: jest.fn(),
      getProductVariants: jest.fn(),
    } as any;

    orderService = new PrintifyOrderService(mockApiClient, mockStorefrontService);
  });

  afterEach(() => {
    orderService.clearOrders();
    jest.clearAllMocks();
  });

  describe('order creation', () => {
    it('should create order from cart items', async () => {
      const cartItems = [createMockCartItem()];
      const mockVariant = createMockVariant();

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant as any]);

      const request: CreateOrderRequest = {
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      };

      const order = await orderService.createOrder(request);

      expect(order.medusaOrderId).toBe('medusa-order-1');
      expect(order.status).toBe(PrintifyOrderStatus.VALIDATED); // Orders start as VALIDATED after creation
      expect(order.items).toHaveLength(1);
      expect(order.pricing.total).toBe(3998); // 1999 * 2
      expect(order.shippingAddress.email).toBe('john.doe@example.com');
    });

    it('should validate cart items during creation', async () => {
      const cartItems = [createMockCartItem()];
      const mockVariant = createMockVariant();
      mockVariant.validateQuantity = jest.fn().mockReturnValue({
        isValid: false,
        reason: 'Insufficient stock'
      });

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant as any]);

      const request: CreateOrderRequest = {
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      };

      await expect(orderService.createOrder(request))
        .rejects.toThrow('Insufficient stock');
    });

    it('should calculate pricing correctly with shipping and tax', async () => {
      const cartItems = [createMockCartItem()];
      const mockVariant = createMockVariant();

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant as any]);

      const request: CreateOrderRequest = {
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
        shippingCost: 500, // $5.00
        taxAmount: 300,    // $3.00
        discountAmount: 200, // $2.00 discount
      };

      const order = await orderService.createOrder(request);

      expect(order.pricing.subtotal).toBe(3998); // 1999 * 2
      expect(order.pricing.shippingCost).toBe(500);
      expect(order.pricing.taxAmount).toBe(300);
      expect(order.pricing.discountAmount).toBe(200);
      expect(order.pricing.total).toBe(4598); // 3998 + 500 + 300 - 200
    });
  });

  describe('order submission', () => {
    let order: PrintifyOrder;

    beforeEach(async () => {
      const cartItems = [createMockCartItem()];
      const mockVariant = createMockVariant();

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant as any]);

      const request: CreateOrderRequest = {
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      };

      order = await orderService.createOrder(request);
    });

    it('should submit order to Printify', async () => {
      const mockPrintifyResponse = {
        id: 'printify-order-123',
        status: 'pending',
      };

      mockApiClient.createOrder.mockResolvedValue(mockPrintifyResponse);

      const submittedOrder = await orderService.submitOrder(order.id);

      expect(submittedOrder.status).toBe(PrintifyOrderStatus.SUBMITTED);
      expect(submittedOrder.printifyOrderId).toBe('printify-order-123');
      expect(mockApiClient.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          external_id: 'medusa-order-1',
          label: 'Medusa Order medusa-order-1',
          line_items: expect.arrayContaining([
            expect.objectContaining({
              product_id: 'printify-product-1',
              variant_id: 'printify-variant-1',
              quantity: 2,
            })
          ]),
          address_to: expect.objectContaining({
            first_name: 'John',
            last_name: 'Doe',
            email: 'john.doe@example.com',
          }),
        })
      );
    });

    it('should handle submission errors', async () => {
      mockApiClient.createOrder.mockRejectedValue(new Error('API Error'));

      await expect(orderService.submitOrder(order.id))
        .rejects.toThrow('API Error');

      const orderAfterError = orderService.getOrder(order.id);
      expect(orderAfterError.lastError).toBeTruthy();
    });
  });

  describe('order status management', () => {
    let order: PrintifyOrder;

    beforeEach(async () => {
      const cartItems = [createMockCartItem()];
      const mockVariant = createMockVariant();

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant as any]);

      const request: CreateOrderRequest = {
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      };

      order = await orderService.createOrder(request);
      
      // Submit order
      mockApiClient.createOrder.mockResolvedValue({
        id: 'printify-order-123',
        status: 'pending',
      });
      await orderService.submitOrder(order.id);
    });

    it('should sync order status from Printify', async () => {
      const mockPrintifyOrder = {
        id: 'printify-order-123',
        status: 'in-production',
        tracking: {
          tracking_number: 'TRACK123',
          tracking_url: 'https://track.example.com/TRACK123',
          carrier: 'UPS',
        },
      };

      mockApiClient.getOrder.mockResolvedValue(mockPrintifyOrder);

      const syncedOrder = await orderService.syncOrderStatus(order.id);

      expect(syncedOrder.status).toBe(PrintifyOrderStatus.SHIPPED); // Based on the mapping logic
      expect(syncedOrder.tracking?.trackingNumber).toBe('TRACK123');
      expect(syncedOrder.tracking?.trackingUrl).toBe('https://track.example.com/TRACK123');
      expect(syncedOrder.tracking?.carrier).toBe('UPS');
    });

    it('should update order status manually', async () => {
      const updatedOrder = await orderService.updateOrderStatus(order.id, {
        status: PrintifyOrderStatus.PROCESSING,
        note: 'Processing started',
      });

      expect(updatedOrder.status).toBe(PrintifyOrderStatus.PROCESSING);
      expect(updatedOrder.statusHistory).toHaveLength(4); // PENDING -> VALIDATED -> SUBMITTED -> PROCESSING
    });
  });

  describe('order cancellation', () => {
    let order: PrintifyOrder;

    beforeEach(async () => {
      const cartItems = [createMockCartItem()];
      const mockVariant = createMockVariant();

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant as any]);

      const request: CreateOrderRequest = {
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      };

      order = await orderService.createOrder(request);
    });

    it('should cancel order before submission', async () => {
      const cancelledOrder = await orderService.cancelOrder(order.id, 'Customer request');

      expect(cancelledOrder.status).toBe(PrintifyOrderStatus.CANCELLED);
      expect(cancelledOrder.statusHistory[2].note).toBe('Customer request'); // Check the cancellation entry
    });

    it('should cancel order after submission', async () => {
      // Submit order first
      mockApiClient.createOrder.mockResolvedValue({
        id: 'printify-order-123',
        status: 'pending',
      });
      await orderService.submitOrder(order.id);

      // Mock Printify cancellation
      mockApiClient.cancelOrder.mockResolvedValue({ success: true });

      const cancelledOrder = await orderService.cancelOrder(order.id, 'Customer request');

      expect(cancelledOrder.status).toBe(PrintifyOrderStatus.CANCELLED);
      expect(mockApiClient.cancelOrder).toHaveBeenCalledWith('printify-order-123');
    });
  });

  describe('order queries', () => {
    beforeEach(async () => {
      // Create multiple orders for testing
      const cartItems = [createMockCartItem()];
      const mockVariant = createMockVariant();

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant as any]);

      // Create orders
      await orderService.createOrder({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      await orderService.createOrder({
        medusaOrderId: 'medusa-order-2',
        customerEmail: 'jane.smith@example.com',
        cartItems,
        shippingAddress: { ...mockShippingAddress, email: 'jane.smith@example.com' },
      });
    });

    it('should list all orders', async () => {
      const result = await orderService.listOrders();

      expect(result.orders).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should filter orders by status', async () => {
      const result = await orderService.listOrders({
        status: [PrintifyOrderStatus.VALIDATED], // Orders are validated after creation
      });

      expect(result.orders).toHaveLength(2);
      result.orders.forEach(order => {
        expect(order.status).toBe(PrintifyOrderStatus.VALIDATED);
      });
    });

    it('should get order statistics', async () => {
      const stats = await orderService.getOrderStats();

      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(2); // VALIDATED orders are counted as pending
      expect(stats.processing).toBe(0);
      expect(stats.shipped).toBe(0);
      expect(stats.delivered).toBe(0);
      expect(stats.cancelled).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.averageProcessingTime).toBeDefined();
      expect(stats.totalValue).toBeDefined();
    });

    it('should find order by Medusa ID', async () => {
      const order = orderService.getOrderByMedusaId('medusa-order-1');

      expect(order).toBeDefined();
      expect(order?.medusaOrderId).toBe('medusa-order-1');
    });

    it('should throw error for non-existent order', () => {
      expect(() => orderService.getOrder('non-existent'))
        .toThrow(PrintifyPluginError);
    });
  });

  describe('error handling', () => {
    it('should handle cart validation errors', async () => {
      const cartItems = [createMockCartItem()];

      // Mock variant not found
      mockStorefrontService.getProductVariants.mockResolvedValue([]);

      const request: CreateOrderRequest = {
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      };

      await expect(orderService.createOrder(request))
        .rejects.toThrow(PrintifyPluginError);
    });

    it('should handle API client errors', async () => {
      const cartItems = [createMockCartItem()];
      const mockVariant = createMockVariant();

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant as any]);

      const request: CreateOrderRequest = {
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      };

      const order = await orderService.createOrder(request);

      // Mock API error
      mockApiClient.createOrder.mockRejectedValue(new Error('Network timeout'));

      await expect(orderService.submitOrder(order.id))
        .rejects.toThrow('Network timeout');
    });

    it('should handle malformed API responses', async () => {
      const cartItems = [createMockCartItem()];
      const mockVariant = createMockVariant();

      mockStorefrontService.getProductVariants.mockResolvedValue([mockVariant as any]);

      const request: CreateOrderRequest = {
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      };

      const order = await orderService.createOrder(request);

      // Mock malformed response (missing ID)
      mockApiClient.createOrder.mockResolvedValue({ status: 'pending' });

      await expect(orderService.submitOrder(order.id))
        .rejects.toThrow(PrintifyPluginError);
    });
  });
});