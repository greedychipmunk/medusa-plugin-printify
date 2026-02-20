/**
 * Unit Tests: Order Cost Tracking (Service Layer)
 *
 * Tests for fetchVariantCosts, cost calculation in createOrderFromCart,
 * bridge cost mapping, and stats aggregation with cost fields.
 */

import PrintifyModuleService from "../../../src/modules/printify/service"
import { PrintifyOrderStatus } from "../../../src/modules/printify/models/printify-order"
import { PrintifyCartItem } from "../../../src/modules/printify/models/printify-cart-item"
import type { CreateOrderRequest } from "../../../src/modules/printify/service"

jest.mock("@medusajs/framework/utils", () => {
  return {
    MedusaService: () => class MockBase {},
    Modules: { PRODUCT: "productService", ORDER: "orderService" },
    ContainerRegistrationKeys: { QUERY: "query" },
    model: {
      define: jest.fn().mockReturnValue({}),
      id: jest.fn().mockReturnValue({ primaryKey: jest.fn() }),
      text: jest.fn().mockReturnValue({ nullable: jest.fn(), unique: jest.fn(), default: jest.fn() }),
      boolean: jest.fn().mockReturnValue({ default: jest.fn() }),
      number: jest.fn().mockReturnValue({ default: jest.fn().mockReturnValue({ nullable: jest.fn() }), nullable: jest.fn().mockReturnValue({ default: jest.fn() }) }),
      json: jest.fn().mockReturnValue({ nullable: jest.fn() }),
      dateTime: jest.fn().mockReturnValue({ nullable: jest.fn() }),
    },
    Module: jest.fn(),
  }
})

describe("Order Cost Tracking (Service Layer)", () => {
  let service: any
  let orderStore: Map<string, any>

  const mockShippingAddress = {
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    address1: "123 Main St",
    city: "New York",
    state: "NY",
    zip: "10001",
    country: "US",
  }

  const createCartItem = (
    productId = "printify-product-1",
    variantId = "1001",
    qty = 2,
    unitPrice = 2500,
  ): PrintifyCartItem =>
    PrintifyCartItem.fromVariant(
      "test-cart",
      "product-1",
      "variant-1",
      productId,
      variantId,
      qty,
      { size: "M" },
      unitPrice,
      "USD",
    )

  beforeEach(() => {
    service = new PrintifyModuleService({} as any, {} as any)
    orderStore = new Map()
    let counter = 0

    service.createPrintifyOrders = jest.fn().mockImplementation(async (data: any[]) =>
      data.map((d) => {
        const order = { id: `order_${++counter}`, ...d, created_at: new Date(), updated_at: new Date() }
        orderStore.set(order.id, order)
        return order
      }),
    )

    service.retrievePrintifyOrder = jest.fn().mockImplementation(async (id: string) => {
      const order = orderStore.get(id)
      if (!order) throw new Error("Not found")
      return order
    })

    service.updatePrintifyOrders = jest.fn().mockImplementation(async (data: any[]) =>
      data.map((d) => {
        const existing = orderStore.get(d.id)
        if (existing) {
          const updated = { ...existing, ...d, updated_at: new Date() }
          orderStore.set(d.id, updated)
          return updated
        }
        return d
      }),
    )

    service.listPrintifyConfigurations = jest.fn().mockResolvedValue([
      { id: "config_1", store_id: "store_1" },
    ])

    service.listAndCountPrintifyOrders = jest.fn().mockImplementation(async () => {
      return [Array.from(orderStore.values()), orderStore.size]
    })

    service.listPrintifyOrders = jest.fn().mockResolvedValue([])

    // Mock link
    ;(service as any).__container__ = {
      resolve: () => ({ create: jest.fn(), dismiss: jest.fn() }),
    }
  })

  describe("fetchVariantCosts", () => {
    it("should return cost map from product printify_data", async () => {
      service.listPrintifyProducts = jest.fn().mockResolvedValue([
        {
          printify_product_id: "printify-product-1",
          printify_data: {
            variants: [
              { id: 1001, cost: 800, price: 2500 },
              { id: 1002, cost: 850, price: 2500 },
            ],
          },
        },
      ])

      const cartItems = [createCartItem()]
      const costMap = await service.fetchVariantCosts(cartItems)

      expect(costMap.has("printify-product-1")).toBe(true)
      const variantCosts = costMap.get("printify-product-1")!
      expect(variantCosts.get("1001")).toBe(800)
      expect(variantCosts.get("1002")).toBe(850)
    })

    it("should return empty map when no products found", async () => {
      service.listPrintifyProducts = jest.fn().mockResolvedValue([])

      const cartItems = [createCartItem()]
      const costMap = await service.fetchVariantCosts(cartItems)

      expect(costMap.size).toBe(0)
    })

    it("should handle multiple unique products", async () => {
      service.listPrintifyProducts = jest.fn().mockImplementation(async (opts: any) => {
        const pid = opts.filters.printify_product_id
        if (pid === "prod-a") {
          return [{ printify_product_id: "prod-a", printify_data: { variants: [{ id: 101, cost: 800 }] } }]
        }
        if (pid === "prod-b") {
          return [{ printify_product_id: "prod-b", printify_data: { variants: [{ id: 201, cost: 500 }] } }]
        }
        return []
      })

      const cartItems = [createCartItem("prod-a", "101"), createCartItem("prod-b", "201")]
      const costMap = await service.fetchVariantCosts(cartItems)

      expect(costMap.size).toBe(2)
      expect(costMap.get("prod-a")!.get("101")).toBe(800)
      expect(costMap.get("prod-b")!.get("201")).toBe(500)
    })

    it("should gracefully handle lookup errors", async () => {
      service.listPrintifyProducts = jest.fn().mockRejectedValue(new Error("DB error"))

      const cartItems = [createCartItem()]
      const costMap = await service.fetchVariantCosts(cartItems)

      expect(costMap.size).toBe(0)
    })
  })

  describe("createOrderFromCart — cost persistence", () => {
    beforeEach(() => {
      service.listPrintifyProducts = jest.fn().mockResolvedValue([
        {
          printify_product_id: "printify-product-1",
          printify_data: {
            variants: [{ id: 1001, cost: 800, price: 2500 }],
          },
        },
      ])
    })

    it("should persist total_cost and cost_per_item on order creation", async () => {
      const cartItems = [createCartItem("printify-product-1", "1001", 2, 2500)]

      const order = await service.createOrderFromCart({
        medusaOrderId: "medusa-1",
        customerEmail: "john@example.com",
        cartItems,
        shippingAddress: mockShippingAddress,
      } as CreateOrderRequest)

      // total_cost = 800 * 2 = 1600
      const createCall = service.createPrintifyOrders.mock.calls[0][0][0]
      expect(createCall.total_cost).toBe(1600)
      expect(createCall.cost_per_item).toEqual([
        {
          printify_product_id: "printify-product-1",
          printify_variant_id: "1001",
          unit_cost: 800,
          quantity: 2,
          total_cost: 1600,
        },
      ])
    })

    it("should set total_cost to 0 when no cost data available", async () => {
      service.listPrintifyProducts = jest.fn().mockResolvedValue([])

      const cartItems = [createCartItem()]
      await service.createOrderFromCart({
        medusaOrderId: "medusa-2",
        customerEmail: "john@example.com",
        cartItems,
        shippingAddress: mockShippingAddress,
      } as CreateOrderRequest)

      const createCall = service.createPrintifyOrders.mock.calls[0][0][0]
      expect(createCall.total_cost).toBe(0)
      expect(createCall.cost_per_item).toBeNull()
    })

    it("should handle multi-item orders with different products", async () => {
      service.listPrintifyProducts = jest.fn().mockImplementation(async (opts: any) => {
        const pid = opts.filters.printify_product_id
        if (pid === "prod-a") {
          return [{ printify_product_id: "prod-a", printify_data: { variants: [{ id: 101, cost: 800 }] } }]
        }
        if (pid === "prod-b") {
          return [{ printify_product_id: "prod-b", printify_data: { variants: [{ id: 201, cost: 500 }] } }]
        }
        return []
      })

      const cartItems = [createCartItem("prod-a", "101", 2, 2500), createCartItem("prod-b", "201", 1, 1800)]

      await service.createOrderFromCart({
        medusaOrderId: "medusa-3",
        customerEmail: "john@example.com",
        cartItems,
        shippingAddress: mockShippingAddress,
      } as CreateOrderRequest)

      const createCall = service.createPrintifyOrders.mock.calls[0][0][0]
      // 800*2 + 500*1 = 2100
      expect(createCall.total_cost).toBe(2100)
      expect(createCall.cost_per_item).toHaveLength(2)
    })
  })

  describe("buildOrderBridge — cost mapping", () => {
    it("should map total_cost and cost_per_item to bridge", async () => {
      service.listPrintifyProducts = jest.fn().mockResolvedValue([
        {
          printify_product_id: "printify-product-1",
          printify_data: { variants: [{ id: 1001, cost: 800 }] },
        },
      ])

      const cartItems = [createCartItem("printify-product-1", "1001", 2, 2500)]
      const order = await service.createOrderFromCart({
        medusaOrderId: "medusa-4",
        customerEmail: "john@example.com",
        cartItems,
        shippingAddress: mockShippingAddress,
      } as CreateOrderRequest)

      // Retrieve via getOrderBridge to test buildOrderBridge
      const bridge = await service.getOrderBridge(order.id)
      expect(bridge.totalCost).toBe(1600)
      expect(bridge.costPerItem).toHaveLength(1)
      expect(bridge.profit).toBe(bridge.pricing.total - 1600)
      expect(bridge.marginPercent).toBeGreaterThan(0)
    })
  })

  describe("getOrderStatsForConfig — cost aggregation", () => {
    it("should aggregate totalCost, totalProfit, avgMarginPercent", async () => {
      // Seed orders directly into the store
      orderStore.set("o1", {
        id: "o1",
        status: "processing",
        total_price: 5000,
        total_cost: 1600,
        created_at: new Date(),
        submitted_at: null,
      })
      orderStore.set("o2", {
        id: "o2",
        status: "delivered",
        total_price: 3000,
        total_cost: 1000,
        created_at: new Date(),
        submitted_at: new Date(Date.now() - 86400000),
      })

      const stats = await service.getOrderStatsForConfig()

      expect(stats.totalCost).toBe(2600) // 1600 + 1000
      expect(stats.totalValue).toBe(8000) // 5000 + 3000
      expect(stats.totalProfit).toBe(5400) // 8000 - 2600
      expect(stats.avgMarginPercent).toBeGreaterThan(0)
    })

    it("should handle orders with zero cost (legacy)", async () => {
      orderStore.set("o1", {
        id: "o1",
        status: "pending",
        total_price: 5000,
        total_cost: 0,
        created_at: new Date(),
      })

      const stats = await service.getOrderStatsForConfig()

      expect(stats.totalCost).toBe(0)
      expect(stats.totalProfit).toBe(5000)
      expect(stats.avgMarginPercent).toBe(0) // No cost data → margin stays 0
    })

    it("should exclude cancelled/failed orders from cost aggregation", async () => {
      orderStore.set("o1", {
        id: "o1",
        status: "processing",
        total_price: 5000,
        total_cost: 1600,
        created_at: new Date(),
      })
      orderStore.set("o2", {
        id: "o2",
        status: "cancelled",
        total_price: 3000,
        total_cost: 1000,
        created_at: new Date(),
      })

      const stats = await service.getOrderStatsForConfig()

      // Only o1 should count (o2 is cancelled)
      expect(stats.totalValue).toBe(5000)
      expect(stats.totalCost).toBe(1600)
      expect(stats.totalProfit).toBe(3400)
    })
  })
})
