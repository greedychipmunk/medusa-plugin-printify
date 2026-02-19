import PrintifyModuleService from '../../../src/modules/printify/service';
import { PrintifyOrderStatus } from '../../../src/modules/printify/models/printify-order';
import { PrintifyCartItem } from '../../../src/modules/printify/models/printify-cart-item';
import { PrintifyPluginError } from '../../../src/modules/printify/utils/error-handling';
import { shippingRateCache } from '../../../src/modules/printify/utils/shipping-cache';
import type { CreateOrderRequest } from '../../../src/modules/printify/service';

// Mock the MedusaService factory so we can instantiate without a real DB
jest.mock('@medusajs/framework/utils', () => {
  return {
    MedusaService: () => class MockBase {},
    Modules: {
      PRODUCT: 'productService',
      ORDER: 'orderService',
    },
    ContainerRegistrationKeys: {
      QUERY: 'query',
    },
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

describe('PrintifyOrderService (via PrintifyModuleService)', () => {
  let service: any;
  let mockApiClient: any;

  // In-memory store simulating the database
  let orderStore: Map<string, any>;

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

  beforeEach(() => {
    service = new PrintifyModuleService({} as any, {} as any);
    orderStore = new Map();

    let counter = 0;

    // Mock the auto-generated CRUD methods with a shared store
    service.createPrintifyOrders = jest.fn().mockImplementation(async (data: any[]) => {
      return data.map((d) => {
        const order = {
          id: `order_${++counter}`,
          ...d,
          created_at: new Date(),
          updated_at: new Date(),
        };
        orderStore.set(order.id, order);
        return order;
      });
    });

    service.retrievePrintifyOrder = jest.fn().mockImplementation(async (id: string) => {
      const order = orderStore.get(id);
      if (!order) throw new Error('Not found');
      return order;
    });

    service.updatePrintifyOrders = jest.fn().mockImplementation(async (data: any[]) => {
      return data.map((d) => {
        const existing = orderStore.get(d.id);
        if (existing) {
          const updated = { ...existing, ...d, updated_at: new Date() };
          orderStore.set(d.id, updated);
          return updated;
        }
        return { ...d, updated_at: new Date() };
      });
    });

    service.listPrintifyConfigurations = jest.fn().mockResolvedValue([
      { id: "config_1", store_id: "store_1" },
    ]);

    service.listAndCountPrintifyOrders = jest.fn().mockResolvedValue([[], 0]);

    service.listPrintifyOrders = jest.fn().mockImplementation(async (opts: any) => {
      const filters = opts?.filters || {};
      const results: any[] = [];
      for (const order of orderStore.values()) {
        let match = true;
        if (filters.medusa_order_id && order.medusa_order_id !== filters.medusa_order_id) match = false;
        if (filters.printify_order_id && order.printify_order_id !== filters.printify_order_id) match = false;
        if (match) results.push(order);
      }
      return results;
    });

    mockApiClient = {
      createOrder: jest.fn(),
      getOrder: jest.fn(),
      cancelOrder: jest.fn(),
      calculateShipping: jest.fn().mockResolvedValue([
        { id: 1, name: 'Standard', cost: 500 },
      ]),
    };

    shippingRateCache.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('order creation', () => {
    it('should create order from cart items', async () => {
      const cartItems = [createMockCartItem()];

      const request: CreateOrderRequest = {
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      };

      const order = await service.createOrderFromCart(request);

      expect(order.medusaOrderId).toBe('medusa-order-1');
      expect(order.status).toBe(PrintifyOrderStatus.PENDING);
      expect(order.items).toHaveLength(1);
      expect(order.pricing.total).toBe(3998); // 1999 * 2
      expect(order.shippingAddress.email).toBe('john.doe@example.com');
      expect(service.createPrintifyOrders).toHaveBeenCalledTimes(1);
    });

    it('should calculate pricing correctly with shipping and tax', async () => {
      const cartItems = [createMockCartItem()];

      const request: CreateOrderRequest = {
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
        shippingCost: 500,
        taxAmount: 300,
        discountAmount: 200,
      };

      const order = await service.createOrderFromCart(request);

      expect(order.pricing.subtotal).toBe(3998);
      expect(order.pricing.shippingCost).toBe(500);
      expect(order.pricing.taxAmount).toBe(300);
      expect(order.pricing.discountAmount).toBe(200);
      expect(order.pricing.total).toBe(4598); // 3998 + 500 + 300 - 200
    });

    it('should create unique order IDs', async () => {
      const cartItems = [createMockCartItem()];

      const order1 = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      const order2 = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-2',
        customerEmail: 'jane@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      expect(order1.id).not.toBe(order2.id);
    });
  });

  describe('order submission', () => {
    it('should submit order to Printify', async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      mockApiClient.createOrder.mockResolvedValue({
        id: 'printify-order-123',
        status: 'pending',
      });

      const submittedOrder = await service.submitPrintifyOrder(order.id, mockApiClient);

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
        })
      );
    });

    it('should handle submission errors', async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      mockApiClient.createOrder.mockRejectedValue(new Error('API Error'));

      await expect(service.submitPrintifyOrder(order.id, mockApiClient))
        .rejects.toThrow('API Error');
    });
  });

  describe('order status management', () => {
    let orderId: string;

    beforeEach(async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });
      orderId = order.id;

      mockApiClient.createOrder.mockResolvedValue({
        id: 'printify-order-123',
        status: 'pending',
      });
      await service.submitPrintifyOrder(orderId, mockApiClient);
    });

    it('should sync order status from Printify', async () => {
      mockApiClient.getOrder.mockResolvedValue({
        id: 'printify-order-123',
        status: 'in-production',
        tracking: {
          tracking_number: 'TRACK123',
          tracking_url: 'https://track.example.com/TRACK123',
          carrier: 'UPS',
        },
      });

      const syncedOrder = await service.syncOrderStatus(orderId, mockApiClient);

      expect(syncedOrder.status).toBe(PrintifyOrderStatus.PROCESSING);
      expect(syncedOrder.tracking?.trackingNumber).toBe('TRACK123');
      expect(syncedOrder.tracking?.trackingUrl).toBe('https://track.example.com/TRACK123');
      expect(syncedOrder.tracking?.carrier).toBe('UPS');
    });

    it('should update order status manually', async () => {
      const updatedOrder = await service.updateOrderStatus(orderId, {
        status: PrintifyOrderStatus.PROCESSING,
        note: 'Processing started',
      });

      expect(updatedOrder.status).toBe(PrintifyOrderStatus.PROCESSING);
      expect(updatedOrder.statusHistory).toHaveLength(2);
    });
  });

  describe('order status transition validation', () => {
    it('should reject invalid status transitions in updateOrderStatus', async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      // PENDING → DELIVERED is not allowed
      await expect(
        service.updateOrderStatus(order.id, {
          status: PrintifyOrderStatus.DELIVERED,
          note: 'Skip to delivered',
        })
      ).rejects.toThrow(PrintifyPluginError);

      await expect(
        service.updateOrderStatus(order.id, {
          status: PrintifyOrderStatus.DELIVERED,
        })
      ).rejects.toThrow(/Invalid status transition/);
    });

    it('should allow valid status transitions in updateOrderStatus', async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      // PENDING → SUBMITTED is allowed
      const updated = await service.updateOrderStatus(order.id, {
        status: PrintifyOrderStatus.SUBMITTED,
        note: 'Submitting order',
      });

      expect(updated.status).toBe(PrintifyOrderStatus.SUBMITTED);
    });

    it('should reject transitions from terminal states', async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      // Move to CANCELLED (terminal)
      await service.updateOrderStatus(order.id, {
        status: PrintifyOrderStatus.CANCELLED,
      });

      // CANCELLED → PENDING is not allowed
      await expect(
        service.updateOrderStatus(order.id, {
          status: PrintifyOrderStatus.PENDING,
        })
      ).rejects.toThrow(/Invalid status transition/);
    });
  });

  describe('order cancellation', () => {
    it('should cancel order before submission', async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      const cancelledOrder = await service.cancelPrintifyOrder(order.id, mockApiClient, 'Customer request');

      expect(cancelledOrder.status).toBe(PrintifyOrderStatus.CANCELLED);
      expect(cancelledOrder.statusHistory[2].note).toBe('Order cancelled');
    });

    it('should cancel order after submission', async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      mockApiClient.createOrder.mockResolvedValue({
        id: 'printify-order-123',
        status: 'pending',
      });
      await service.submitPrintifyOrder(order.id, mockApiClient);

      mockApiClient.cancelOrder.mockResolvedValue({ success: true });

      const cancelledOrder = await service.cancelPrintifyOrder(order.id, mockApiClient, 'Customer request');

      expect(cancelledOrder.status).toBe(PrintifyOrderStatus.CANCELLED);
      expect(mockApiClient.cancelOrder).toHaveBeenCalledWith('printify-order-123');
    });
  });

  describe('order queries', () => {
    beforeEach(async () => {
      const cartItems = [createMockCartItem()];

      await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-2',
        customerEmail: 'jane.smith@example.com',
        cartItems,
        shippingAddress: { ...mockShippingAddress, email: 'jane.smith@example.com' },
      });
    });

    it('should list all orders', async () => {
      // Mock the DB list to return our orders
      service.listAndCountPrintifyOrders = jest.fn().mockResolvedValue([
        [
          { id: 'order_1', medusa_order_id: 'medusa-order-1', status: 'pending', total_price: 3998, line_items: [], shipping_address: {}, created_at: new Date(), updated_at: new Date() },
          { id: 'order_2', medusa_order_id: 'medusa-order-2', status: 'pending', total_price: 3998, line_items: [], shipping_address: {}, created_at: new Date(), updated_at: new Date() },
        ],
        2,
      ]);

      const result = await service.listOrdersFiltered();

      expect(result.orders).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should filter orders by status', async () => {
      service.listAndCountPrintifyOrders = jest.fn().mockResolvedValue([
        [
          { id: 'order_1', medusa_order_id: 'medusa-order-1', status: 'pending', total_price: 3998, line_items: [], shipping_address: {}, created_at: new Date(), updated_at: new Date() },
          { id: 'order_2', medusa_order_id: 'medusa-order-2', status: 'pending', total_price: 3998, line_items: [], shipping_address: {}, created_at: new Date(), updated_at: new Date() },
        ],
        2,
      ]);

      const result = await service.listOrdersFiltered({
        status: [PrintifyOrderStatus.PENDING],
      });

      expect(result.orders).toHaveLength(2);
      result.orders.forEach((order: any) => {
        expect(order.status).toBe(PrintifyOrderStatus.PENDING);
      });
    });

    it('should get order statistics', async () => {
      service.listAndCountPrintifyOrders = jest.fn().mockResolvedValue([
        [
          { id: 'order_1', status: 'pending', total_price: 3998, created_at: new Date(), updated_at: new Date() },
          { id: 'order_2', status: 'pending', total_price: 3998, created_at: new Date(), updated_at: new Date() },
        ],
        2,
      ]);

      const stats = await service.getOrderStatsForConfig();

      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(2);
      expect(stats.processing).toBe(0);
      expect(stats.shipped).toBe(0);
      expect(stats.delivered).toBe(0);
      expect(stats.cancelled).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.averageProcessingTime).toBeDefined();
      expect(stats.totalValue).toBeDefined();
    });

    it('should find order by Medusa ID', async () => {
      const order = await service.getOrderByMedusaId('medusa-order-1');

      expect(order).toBeDefined();
      expect(order?.medusaOrderId).toBe('medusa-order-1');
    });

    it('should throw error for non-existent order', async () => {
      await expect(service.getOrderBridge('non-existent'))
        .rejects.toThrow(PrintifyPluginError);
    });
  });

  describe('getOrderWithMedusaData', () => {
    let mockQuery: any;

    beforeEach(() => {
      mockQuery = {
        graph: jest.fn(),
      };
      (service as any).__container__ = {
        resolve: (key: string) => {
          if (key === 'query') return mockQuery;
          if (key === 'link') return { create: jest.fn(), dismiss: jest.fn() };
          return undefined;
        },
      };
    });

    it('should return enriched data via query.graph', async () => {
      mockQuery.graph.mockResolvedValue({
        data: [{
          id: 'order_1',
          medusa_order_id: 'medusa-order-1',
          status: 'pending',
          order: { id: 'medusa-o-1', display_id: '1001', status: 'pending', email: 'test@example.com' },
        }],
      });

      const result = await service.getOrderWithMedusaData('order_1');

      expect(mockQuery.graph).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'printify_order',
          filters: { id: 'order_1' },
        })
      );
      expect(result.order.display_id).toBe('1001');
    });

    it('should fall back to getOrderBridge on query.graph failure', async () => {
      mockQuery.graph.mockRejectedValue(new Error('Query error'));

      // Create an order first so getOrderBridge can find it
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-fallback',
        customerEmail: 'fallback@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      const result = await service.getOrderWithMedusaData(order.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(order.id);
    });
  });

  describe('shipping method validation on submit', () => {
    it('should reject submission with invalid shipping method', async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
        shippingMethod: 99,
      });

      mockApiClient.calculateShipping = jest.fn().mockResolvedValue([
        { id: 1, name: 'Standard', cost: 500 },
        { id: 2, name: 'Express', cost: 1200 },
      ]);

      await expect(service.submitPrintifyOrder(order.id, mockApiClient))
        .rejects.toThrow(/Shipping method 99 is not available/);

      expect(mockApiClient.createOrder).not.toHaveBeenCalled();
    });

    it('should allow submission with valid shipping method', async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
        shippingMethod: 2,
      });

      mockApiClient.calculateShipping = jest.fn().mockResolvedValue([
        { id: 1, name: 'Standard', cost: 500 },
        { id: 2, name: 'Express', cost: 1200 },
      ]);

      mockApiClient.createOrder.mockResolvedValue({
        id: 'printify-order-123',
        status: 'pending',
      });

      const submitted = await service.submitPrintifyOrder(order.id, mockApiClient);

      expect(submitted.status).toBe(PrintifyOrderStatus.SUBMITTED);
      expect(mockApiClient.calculateShipping).toHaveBeenCalledTimes(1);
      expect(mockApiClient.createOrder).toHaveBeenCalledTimes(1);
    });

    it('should propagate shipping API errors during validation', async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      mockApiClient.calculateShipping = jest.fn().mockRejectedValue(
        new Error('Printify shipping API down'),
      );

      await expect(service.submitPrintifyOrder(order.id, mockApiClient))
        .rejects.toThrow('Printify shipping API down');

      expect(mockApiClient.createOrder).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle API client errors', async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      mockApiClient.createOrder.mockRejectedValue(new Error('Network timeout'));

      await expect(service.submitPrintifyOrder(order.id, mockApiClient))
        .rejects.toThrow('Network timeout');
    });

    it('should handle malformed API responses', async () => {
      const cartItems = [createMockCartItem()];
      const order = await service.createOrderFromCart({
        medusaOrderId: 'medusa-order-1',
        customerEmail: 'john.doe@example.com',
        cartItems,
        shippingAddress: mockShippingAddress,
      });

      mockApiClient.createOrder.mockResolvedValue({ status: 'pending' });

      await expect(service.submitPrintifyOrder(order.id, mockApiClient))
        .rejects.toThrow(PrintifyPluginError);
    });
  });
});
