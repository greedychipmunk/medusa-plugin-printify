/**
 * Unit Tests: Analytics Service Method (getAnalyticsForConfig)
 *
 * Uses mock service with in-memory order and product data.
 */

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

import PrintifyModuleService from "../../../src/modules/printify/service"

function createMockService(orders: any[] = [], products: any[] = []) {
  const service = new PrintifyModuleService()

  ;(service as any).listAndCountPrintifyOrders = jest.fn().mockImplementation((opts: any) => {
    let filtered = [...orders]
    if (opts?.filters?.configuration_id) {
      filtered = filtered.filter((o) => o.configuration_id === opts.filters.configuration_id)
    }
    return [filtered, filtered.length]
  })

  ;(service as any).listPrintifyProducts = jest.fn().mockImplementation((opts: any) => {
    if (opts?.filters?.printify_product_id) {
      return products.filter((p) => p.printify_product_id === opts.filters.printify_product_id)
    }
    return products
  })

  return service
}

describe("getAnalyticsForConfig", () => {
  // 1. Zero orders returns zero totals
  it("should return zero totals for zero orders", async () => {
    const service = createMockService()
    const result = await service.getAnalyticsForConfig()

    expect(result.sales_summary.total_revenue).toBe(0)
    expect(result.sales_summary.total_orders).toBe(0)
    expect(result.sales_summary.avg_order_value).toBe(0)
    expect(result.fulfillment_metrics.fulfillment_rate).toBe(0)
    expect(result.top_products).toHaveLength(0)
  })

  // 2. Sums revenue from subtotal fields correctly
  it("should sum revenue from subtotal fields", async () => {
    const orders = [
      {
        id: "o1",
        status: "delivered",
        total_price: 12000,
        subtotal: 10000,
        shipping_cost: 1000,
        tax_amount: 1500,
        discount_amount: 500,
        line_items: [],
        created_at: new Date("2026-01-15"),
        updated_at: new Date("2026-01-20"),
      },
      {
        id: "o2",
        status: "shipped",
        total_price: 8000,
        subtotal: 7000,
        shipping_cost: 500,
        tax_amount: 800,
        discount_amount: 300,
        line_items: [],
        created_at: new Date("2026-01-16"),
        updated_at: new Date("2026-01-21"),
      },
    ]
    const service = createMockService(orders)
    const result = await service.getAnalyticsForConfig()

    expect(result.sales_summary.total_revenue).toBe(17000)
    expect(result.sales_summary.total_shipping).toBe(1500)
    expect(result.sales_summary.total_tax).toBe(2300)
    expect(result.sales_summary.total_discounts).toBe(800)
    expect(result.sales_summary.total_orders).toBe(2)
    expect(result.sales_summary.avg_order_value).toBe(8500)
  })

  // 3. Falls back to total_price when subtotal is null
  it("should fall back to total_price when subtotal is null", async () => {
    const orders = [
      {
        id: "o1",
        status: "pending",
        total_price: 5000,
        subtotal: null,
        shipping_cost: null,
        tax_amount: null,
        discount_amount: null,
        line_items: [],
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]
    const service = createMockService(orders)
    const result = await service.getAnalyticsForConfig()

    expect(result.sales_summary.total_revenue).toBe(5000)
    expect(result.sales_summary.total_shipping).toBe(0)
    expect(result.sales_summary.total_tax).toBe(0)
    expect(result.sales_summary.total_discounts).toBe(0)
  })

  // 4. Date range filtering works
  it("should filter by date range", async () => {
    const orders = [
      {
        id: "o1", status: "delivered", total_price: 5000, subtotal: 5000,
        shipping_cost: 0, tax_amount: 0, discount_amount: 0,
        line_items: [], created_at: new Date("2026-01-01"), updated_at: new Date("2026-01-05"),
      },
      {
        id: "o2", status: "delivered", total_price: 3000, subtotal: 3000,
        shipping_cost: 0, tax_amount: 0, discount_amount: 0,
        line_items: [], created_at: new Date("2026-02-15"), updated_at: new Date("2026-02-20"),
      },
    ]
    const service = createMockService(orders)
    const result = await service.getAnalyticsForConfig(
      undefined,
      new Date("2026-02-01"),
      new Date("2026-02-28"),
    )

    expect(result.sales_summary.total_orders).toBe(1)
    expect(result.sales_summary.total_revenue).toBe(3000)
  })

  // 5. Fulfillment rate computation
  it("should compute fulfillment rate correctly", async () => {
    const orders = [
      { id: "o1", status: "delivered", total_price: 1000, subtotal: 1000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], created_at: new Date(), updated_at: new Date(), submitted_at: new Date(Date.now() - 86400000) },
      { id: "o2", status: "shipped", total_price: 1000, subtotal: 1000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], created_at: new Date(), updated_at: new Date(), submitted_at: new Date(Date.now() - 86400000) },
      { id: "o3", status: "pending", total_price: 1000, subtotal: 1000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], created_at: new Date(), updated_at: new Date() },
      { id: "o4", status: "cancelled", total_price: 1000, subtotal: 1000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], created_at: new Date(), updated_at: new Date() },
    ]
    const service = createMockService(orders)
    const result = await service.getAnalyticsForConfig()

    // Fulfillment = (shipped + delivered) / (total - cancelled - failed) = 2/3
    expect(result.fulfillment_metrics.fulfillment_rate).toBeCloseTo(0.67, 1)
    expect(result.fulfillment_metrics.orders_by_status.delivered).toBe(1)
    expect(result.fulfillment_metrics.orders_by_status.shipped).toBe(1)
  })

  // 6. Top products aggregation with margin from printify_data
  it("should aggregate top products with margins", async () => {
    const orders = [
      {
        id: "o1", status: "delivered", total_price: 5000, subtotal: 5000,
        shipping_cost: 0, tax_amount: 0, discount_amount: 0,
        created_at: new Date(), updated_at: new Date(),
        line_items: [
          { printifyProductId: "prod-1", printifyVariantId: "100", quantity: 2, title: "Cool T-Shirt", pricing: { unitPrice: 2000, totalPrice: 4000 } },
          { printifyProductId: "prod-2", printifyVariantId: "200", quantity: 1, title: "Nice Mug", pricing: { unitPrice: 1000, totalPrice: 1000 } },
        ],
      },
    ]
    const products = [
      { printify_product_id: "prod-1", printify_data: { variants: [{ id: 100, cost: 800 }] } },
      { printify_product_id: "prod-2", printify_data: { variants: [{ id: 200, cost: 400 }] } },
    ]
    const service = createMockService(orders, products)
    const result = await service.getAnalyticsForConfig()

    expect(result.top_products).toHaveLength(2)
    // prod-1: revenue=4000, cost=800*2=1600, margin=2400
    const tshirt = result.top_products.find((p) => p.printify_product_id === "prod-1")
    expect(tshirt).toBeDefined()
    expect(tshirt!.revenue).toBe(4000)
    expect(tshirt!.cost).toBe(1600)
    expect(tshirt!.margin_amount).toBe(2400)
    expect(tshirt!.units_sold).toBe(2)

    // prod-2: revenue=1000, cost=400, margin=600
    const mug = result.top_products.find((p) => p.printify_product_id === "prod-2")
    expect(mug!.cost).toBe(400)
    expect(mug!.margin_amount).toBe(600)
  })

  // 7. Handles missing printify_data gracefully
  it("should handle missing printify_data (cost = 0)", async () => {
    const orders = [
      {
        id: "o1", status: "pending", total_price: 3000, subtotal: 3000,
        shipping_cost: 0, tax_amount: 0, discount_amount: 0,
        created_at: new Date(), updated_at: new Date(),
        line_items: [
          { printifyProductId: "prod-x", printifyVariantId: "999", quantity: 1, title: "Unknown", pricing: { totalPrice: 3000 } },
        ],
      },
    ]
    const service = createMockService(orders, []) // no products
    const result = await service.getAnalyticsForConfig()

    expect(result.top_products).toHaveLength(1)
    expect(result.top_products[0].cost).toBe(0)
    expect(result.top_products[0].margin_amount).toBe(3000)
  })

  // 8. Excludes cancelled/failed from revenue totals
  it("should exclude cancelled and failed orders from revenue", async () => {
    const orders = [
      { id: "o1", status: "delivered", total_price: 5000, subtotal: 5000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], created_at: new Date(), updated_at: new Date() },
      { id: "o2", status: "cancelled", total_price: 3000, subtotal: 3000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], created_at: new Date(), updated_at: new Date() },
      { id: "o3", status: "failed", total_price: 2000, subtotal: 2000, shipping_cost: 0, tax_amount: 0, discount_amount: 0, line_items: [], created_at: new Date(), updated_at: new Date() },
    ]
    const service = createMockService(orders)
    const result = await service.getAnalyticsForConfig()

    expect(result.sales_summary.total_revenue).toBe(5000)
    expect(result.sales_summary.total_orders).toBe(1)
    // But all orders appear in fulfillment metrics
    expect(result.fulfillment_metrics.orders_by_status.cancelled).toBe(1)
    expect(result.fulfillment_metrics.orders_by_status.failed).toBe(1)
  })
})
