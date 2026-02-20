/**
 * Integration Tests: Order Cost Lifecycle
 *
 * Full lifecycle tests: cost capture at order creation, immutability after
 * product cost changes, multi-item orders, and stats aggregation.
 * Mocks only the HTTP boundary (axios) — all business logic runs for real.
 */

jest.mock("axios", () => ({
  __esModule: true,
  default: { create: jest.fn() },
}))

jest.mock("@medusajs/framework/utils", () => {
  const modelChain = {
    primaryKey: () => modelChain,
    unique: () => modelChain,
    nullable: () => modelChain,
    default: () => modelChain,
  }
  return {
    MedusaService: () => class MockBase {},
    Modules: { PRODUCT: "productService", ORDER: "orderService" },
    ContainerRegistrationKeys: { QUERY: "query" },
    model: {
      define: jest.fn().mockReturnValue({}),
      id: () => modelChain,
      text: () => modelChain,
      number: () => modelChain,
      boolean: () => modelChain,
      json: () => modelChain,
      dateTime: () => modelChain,
    },
    Module: jest.fn(),
    defineConfig: jest.fn(),
  }
})

import { createTestService, TestServiceContext } from "./helpers/test-service-factory"
import { PrintifyCartItem } from "../../src/modules/printify/models/printify-cart-item"

function buildCartItem(
  printifyProductId: string,
  printifyVariantId: string,
  qty: number,
  unitPrice: number,
): PrintifyCartItem {
  return PrintifyCartItem.fromVariant(
    "cart_1",
    "prod_local",
    "var_local",
    printifyProductId,
    printifyVariantId,
    qty,
    { size: "M" },
    unitPrice,
    "USD",
  )
}

const SHIPPING_ADDRESS = {
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  phone: "555-0123",
  address1: "123 Main St",
  city: "Portland",
  state: "OR",
  zip: "97201",
  country: "US",
}

describe("Integration: Order Cost Lifecycle", () => {
  let ctx: TestServiceContext

  beforeEach(() => {
    ctx = createTestService()

    // Seed configuration
    ctx.stores.configurations.create([
      {
        id: "config_1",
        store_id: "store_1",
        printify_api_key: "test-key",
        printify_shop_id: "12345",
        sync_enabled: true,
        sync_frequency: 60,
      },
    ])

    // Seed a product with variant costs
    ctx.stores.products.create([
      {
        id: "local_prod_1",
        printify_product_id: "prod_abc123",
        configuration_id: "config_1",
        title: "Classic T-Shirt",
        enabled: true,
        printify_data: {
          variants: [
            { id: 1001, cost: 800, price: 2500 },
            { id: 1002, cost: 850, price: 2500 },
          ],
        },
      },
      {
        id: "local_prod_2",
        printify_product_id: "prod_def456",
        configuration_id: "config_1",
        title: "Canvas Mug",
        enabled: true,
        printify_data: {
          variants: [{ id: 2001, cost: 500, price: 1800 }],
        },
      },
    ])
  })

  it("captures production costs at order creation time", async () => {
    const order = await ctx.service.createOrderFromCart({
      medusaOrderId: "medusa_order_1",
      customerEmail: "jane@example.com",
      cartItems: [buildCartItem("prod_abc123", "1001", 2, 2500)],
      shippingAddress: SHIPPING_ADDRESS,
    })

    // Verify cost fields on the bridge
    const bridge = await ctx.service.getOrderBridge(order.id)
    expect(bridge.totalCost).toBe(1600) // 800 * 2
    expect(bridge.costPerItem).toHaveLength(1)
    expect(bridge.costPerItem[0]).toEqual({
      printify_product_id: "prod_abc123",
      printify_variant_id: "1001",
      unit_cost: 800,
      quantity: 2,
      total_cost: 1600,
    })
    expect(bridge.profit).toBe(bridge.pricing.total - 1600)
    expect(bridge.marginPercent).toBeGreaterThan(0)
  })

  it("costs are immutable after product cost changes", async () => {
    // Create order at original cost
    const order = await ctx.service.createOrderFromCart({
      medusaOrderId: "medusa_order_2",
      customerEmail: "jane@example.com",
      cartItems: [buildCartItem("prod_abc123", "1001", 1, 2500)],
      shippingAddress: SHIPPING_ADDRESS,
    })

    const originalCost = (await ctx.service.getOrderBridge(order.id)).totalCost
    expect(originalCost).toBe(800) // 800 * 1

    // Simulate product cost increase
    ctx.stores.products.update([
      {
        id: "local_prod_1",
        printify_data: {
          variants: [
            { id: 1001, cost: 1200, price: 2500 }, // Cost increased from 800 to 1200
            { id: 1002, cost: 1250, price: 2500 },
          ],
        },
      },
    ])

    // Existing order should retain original cost
    const bridge = await ctx.service.getOrderBridge(order.id)
    expect(bridge.totalCost).toBe(800) // Still 800, not 1200
  })

  it("handles multi-item orders with different products", async () => {
    const order = await ctx.service.createOrderFromCart({
      medusaOrderId: "medusa_order_3",
      customerEmail: "jane@example.com",
      cartItems: [
        buildCartItem("prod_abc123", "1001", 2, 2500), // cost: 800 * 2 = 1600
        buildCartItem("prod_def456", "2001", 1, 1800), // cost: 500 * 1 = 500
      ],
      shippingAddress: SHIPPING_ADDRESS,
    })

    const bridge = await ctx.service.getOrderBridge(order.id)
    expect(bridge.totalCost).toBe(2100) // 1600 + 500
    expect(bridge.costPerItem).toHaveLength(2)
  })

  it("handles orders with unknown products gracefully", async () => {
    // Product that doesn't exist locally
    const order = await ctx.service.createOrderFromCart({
      medusaOrderId: "medusa_order_4",
      customerEmail: "jane@example.com",
      cartItems: [buildCartItem("unknown_product", "9999", 1, 2000)],
      shippingAddress: SHIPPING_ADDRESS,
    })

    const bridge = await ctx.service.getOrderBridge(order.id)
    // Unknown product → no cost data → total_cost stays 0
    expect(bridge.totalCost).toBe(0)
  })

  it("aggregates cost data in order stats", async () => {
    // Create two orders with known costs
    await ctx.service.createOrderFromCart({
      medusaOrderId: "medusa_order_5",
      customerEmail: "jane@example.com",
      cartItems: [buildCartItem("prod_abc123", "1001", 2, 2500)],
      shippingAddress: SHIPPING_ADDRESS,
    })

    await ctx.service.createOrderFromCart({
      medusaOrderId: "medusa_order_6",
      customerEmail: "john@example.com",
      cartItems: [buildCartItem("prod_def456", "2001", 3, 1800)],
      shippingAddress: SHIPPING_ADDRESS,
    })

    const stats = await ctx.service.getOrderStatsForConfig()

    // Order 1: revenue=5000 (2500*2), cost=1600 (800*2)
    // Order 2: revenue=5400 (1800*3), cost=1500 (500*3)
    expect(stats.totalValue).toBe(10400) // 5000 + 5400
    expect(stats.totalCost).toBe(3100) // 1600 + 1500
    expect(stats.totalProfit).toBe(7300) // 10400 - 3100
    expect(stats.avgMarginPercent).toBeGreaterThan(0)
  })

  it("legacy orders contribute zero cost to stats", async () => {
    // Manually seed a legacy order (no cost fields)
    ctx.stores.orders.create([
      {
        id: "legacy_order",
        medusa_order_id: "medusa_legacy",
        configuration_id: "config_1",
        status: "delivered",
        line_items: [],
        shipping_address: SHIPPING_ADDRESS,
        total_price: 5000,
        total_cost: 0,
        cost_per_item: null,
        created_at: new Date(),
      },
    ])

    const stats = await ctx.service.getOrderStatsForConfig()

    expect(stats.totalValue).toBe(5000)
    expect(stats.totalCost).toBe(0)
    expect(stats.totalProfit).toBe(5000)
    // avgMarginPercent should be 0 since totalCost is 0
    expect(stats.avgMarginPercent).toBe(0)
  })
})
