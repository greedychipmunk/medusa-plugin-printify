/**
 * Integration Tests: Analytics
 *
 * Uses createTestService() factory, seeds orders + products into in-memory stores.
 * Full computation chain: revenue, margins, fulfillment metrics with realistic data.
 */

jest.mock("axios", () => ({
  __esModule: true,
  default: { create: jest.fn() },
}))

import { createTestService, TestServiceContext } from "./helpers/test-service-factory"

describe("Integration: Analytics", () => {
  let ctx: TestServiceContext

  beforeEach(() => {
    ctx = createTestService()

    // Seed a configuration
    ctx.stores.configurations.create([{
      id: "config-1",
      store_id: "store-1",
      printify_api_key: "key",
      printify_shop_id: "shop",
      sync_enabled: true,
      sync_frequency: 60,
      auto_submit_orders: false,
    }])

    // Seed products with printify_data containing variant costs
    ctx.stores.products.create([
      {
        id: "prod-1",
        printify_product_id: "pp-100",
        configuration_id: "config-1",
        title: "Premium T-Shirt",
        enabled: true,
        blueprint_id: "1",
        print_provider_id: "1",
        printify_data: {
          variants: [
            { id: 1001, cost: 900, price: 2500 },
            { id: 1002, cost: 950, price: 2700 },
          ],
        },
      },
      {
        id: "prod-2",
        printify_product_id: "pp-200",
        configuration_id: "config-1",
        title: "Coffee Mug",
        enabled: true,
        blueprint_id: "2",
        print_provider_id: "1",
        printify_data: {
          variants: [
            { id: 2001, cost: 500, price: 1500 },
          ],
        },
      },
    ])
  })

  // 1. Returns zero analytics for empty store
  it("should return zero analytics when no orders exist", async () => {
    const result = await ctx.service.getAnalyticsForConfig("config-1")

    expect(result.sales_summary.total_revenue).toBe(0)
    expect(result.sales_summary.total_orders).toBe(0)
    expect(result.fulfillment_metrics.fulfillment_rate).toBe(0)
    expect(result.top_products).toHaveLength(0)
  })

  // 2. Computes revenue correctly with pricing breakdown
  it("should compute revenue from persisted pricing breakdown", async () => {
    ctx.stores.orders.create([
      {
        id: "order-1",
        medusa_order_id: "med-1",
        configuration_id: "config-1",
        status: "delivered",
        total_price: 4100,
        subtotal: 3500,
        shipping_cost: 400,
        tax_amount: 300,
        discount_amount: 100,
        line_items: [
          { printifyProductId: "pp-100", printifyVariantId: "1001", quantity: 1, title: "Premium T-Shirt", pricing: { totalPrice: 2500 } },
          { printifyProductId: "pp-200", printifyVariantId: "2001", quantity: 1, title: "Coffee Mug", pricing: { totalPrice: 1000 } },
        ],
        shipping_address: {},
        submitted_at: new Date("2026-01-10"),
        created_at: new Date("2026-01-10"),
        updated_at: new Date("2026-01-15"),
      },
    ])

    const result = await ctx.service.getAnalyticsForConfig("config-1")

    expect(result.sales_summary.total_revenue).toBe(3500)
    expect(result.sales_summary.total_shipping).toBe(400)
    expect(result.sales_summary.total_tax).toBe(300)
    expect(result.sales_summary.total_discounts).toBe(100)
  })

  // 3. Computes profit margins from printify_data variant costs
  it("should compute profit margins from printify_data", async () => {
    ctx.stores.orders.create([
      {
        id: "order-1",
        medusa_order_id: "med-1",
        configuration_id: "config-1",
        status: "delivered",
        total_price: 2500,
        subtotal: 2500,
        shipping_cost: 0,
        tax_amount: 0,
        discount_amount: 0,
        line_items: [
          { printifyProductId: "pp-100", printifyVariantId: "1001", quantity: 2, title: "Premium T-Shirt", pricing: { totalPrice: 5000 } },
        ],
        shipping_address: {},
        created_at: new Date("2026-01-10"),
        updated_at: new Date("2026-01-15"),
      },
    ])

    const result = await ctx.service.getAnalyticsForConfig("config-1")

    const tshirt = result.top_products.find((p) => p.printify_product_id === "pp-100")
    expect(tshirt).toBeDefined()
    expect(tshirt!.revenue).toBe(5000)
    expect(tshirt!.cost).toBe(1800) // 900 * 2
    expect(tshirt!.margin_amount).toBe(3200)
    expect(tshirt!.margin_pct).toBeCloseTo(64, 0)
  })

  // 4. Fulfillment metrics across order statuses
  it("should compute fulfillment metrics correctly", async () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86400000)

    ctx.stores.orders.create([
      { id: "o1", medusa_order_id: "m1", configuration_id: "config-1", status: "delivered", total_price: 1000, subtotal: 1000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], shipping_address: {}, submitted_at: yesterday, created_at: yesterday, updated_at: now },
      { id: "o2", medusa_order_id: "m2", configuration_id: "config-1", status: "shipped", total_price: 1000, subtotal: 1000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], shipping_address: {}, submitted_at: yesterday, created_at: yesterday, updated_at: now },
      { id: "o3", medusa_order_id: "m3", configuration_id: "config-1", status: "pending", total_price: 1000, subtotal: 1000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], shipping_address: {}, created_at: now, updated_at: now },
      { id: "o4", medusa_order_id: "m4", configuration_id: "config-1", status: "cancelled", total_price: 1000, subtotal: 1000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], shipping_address: {}, created_at: now, updated_at: now },
    ])

    const result = await ctx.service.getAnalyticsForConfig("config-1")

    expect(result.fulfillment_metrics.orders_by_status).toEqual(
      expect.objectContaining({ delivered: 1, shipped: 1, pending: 1, cancelled: 1 }),
    )
    // fulfillment = 2 / (4 - 1) = 0.67
    expect(result.fulfillment_metrics.fulfillment_rate).toBeCloseTo(0.67, 1)
    expect(result.fulfillment_metrics.avg_processing_time_hours).toBeGreaterThan(0)
  })

  // 5. Date range filtering
  it("should filter analytics by date range", async () => {
    ctx.stores.orders.create([
      { id: "o-jan", medusa_order_id: "m1", configuration_id: "config-1", status: "delivered", total_price: 5000, subtotal: 5000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], shipping_address: {}, created_at: new Date("2026-01-15"), updated_at: new Date("2026-01-20") },
      { id: "o-feb", medusa_order_id: "m2", configuration_id: "config-1", status: "delivered", total_price: 3000, subtotal: 3000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], shipping_address: {}, created_at: new Date("2026-02-10"), updated_at: new Date("2026-02-15") },
    ])

    const result = await ctx.service.getAnalyticsForConfig(
      "config-1",
      new Date("2026-02-01"),
      new Date("2026-02-28"),
    )

    expect(result.sales_summary.total_orders).toBe(1)
    expect(result.sales_summary.total_revenue).toBe(3000)
  })

  // 6. Falls back to total_price for old orders without breakdown
  it("should fall back to total_price for orders without subtotal", async () => {
    ctx.stores.orders.create([
      {
        id: "old-order",
        medusa_order_id: "m-old",
        configuration_id: "config-1",
        status: "delivered",
        total_price: 7500,
        // no subtotal, shipping_cost, tax_amount, discount_amount
        line_items: [],
        shipping_address: {},
        created_at: new Date("2026-01-10"),
        updated_at: new Date("2026-01-15"),
      },
    ])

    const result = await ctx.service.getAnalyticsForConfig("config-1")

    expect(result.sales_summary.total_revenue).toBe(7500)
    expect(result.sales_summary.total_shipping).toBe(0)
  })
})
