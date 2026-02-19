/**
 * Integration Tests: Bulk Order Lifecycle
 *
 * Tests bulk submit, cancel, and retry operations end-to-end.
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
import {
  setupAxiosMock,
  MockAxiosInstance,
  PRINTIFY_ORDER_RESPONSE,
  PRINTIFY_SHIPPING_RATES,
} from "./helpers/mock-printify-api"
import { PrintifyApiClient } from "../../src/modules/printify/services/printify-api-client"
import { PrintifyCartItem } from "../../src/modules/printify/models/printify-cart-item"
import { shippingRateCache } from "../../src/modules/printify/utils/shipping-cache"

// ── Helpers ────────────────────────────────────────────────────────

function buildCartItems(): PrintifyCartItem[] {
  return [
    PrintifyCartItem.fromVariant(
      "cart_1",
      "prod_1",
      "var_1",
      "printify_prod_1",
      "printify_var_1",
      2,
      { size: "M", color: "Black" },
      1999,
      "USD"
    ),
  ]
}

const SHIPPING_ADDRESS = {
  firstName: "John",
  lastName: "Doe",
  email: "john@example.com",
  address1: "123 Main St",
  city: "New York",
  state: "NY",
  zip: "10001",
  country: "US",
}

// ── Tests ──────────────────────────────────────────────────────────

describe("Bulk Order Lifecycle (integration)", () => {
  let ctx: TestServiceContext
  let axiosMock: MockAxiosInstance
  let apiClient: PrintifyApiClient

  beforeEach(() => {
    shippingRateCache.clear()
    ctx = createTestService()

    // Seed a configuration
    ctx.stores.configurations.create([
      {
        id: "config-1",
        store_id: "store-1",
        printify_api_key: "test-key",
        printify_shop_id: "shop-1",
        sync_enabled: true,
        sync_frequency: 60,
        auto_submit_orders: false,
      },
    ])

    // Set up axios mock
    axiosMock = setupAxiosMock()

    // Configure default API responses — shipping URL must be checked before orders
    axiosMock.post.mockImplementation((url: string) => {
      if (url.includes("/shipping")) {
        return Promise.resolve({ data: PRINTIFY_SHIPPING_RATES })
      }
      if (url.includes("/orders")) {
        return Promise.resolve({ data: PRINTIFY_ORDER_RESPONSE })
      }
      return Promise.resolve({ data: {} })
    })
    axiosMock.get.mockImplementation(() =>
      Promise.resolve({ data: PRINTIFY_ORDER_RESPONSE })
    )

    apiClient = new PrintifyApiClient({
      apiKey: "test-key",
      shopId: "shop-1",
    })
  })

  async function createTestOrder(overrides: Record<string, any> = {}): Promise<string> {
    const order = await ctx.service.createOrderFromCart({
      medusaOrderId: `medusa-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      configurationId: "config-1",
      customerEmail: "john@example.com",
      cartItems: buildCartItems(),
      shippingAddress: SHIPPING_ADDRESS,
      ...overrides,
    })
    return order.id
  }

  it("should bulk submit multiple pending orders", async () => {
    const id1 = await createTestOrder()
    const id2 = await createTestOrder()

    const result = await ctx.service.bulkSubmitOrders([id1, id2], apiClient)

    expect(result.success_count).toBe(2)
    expect(result.failure_count).toBe(0)
    expect(result.failed_orders).toHaveLength(0)

    // Verify both orders are now submitted
    const order1 = await ctx.service.getOrderBridge(id1)
    const order2 = await ctx.service.getOrderBridge(id2)
    expect(order1.status).toBe("submitted")
    expect(order2.status).toBe("submitted")
  })

  it("should handle mixed statuses in bulk submit (partial success)", async () => {
    const id1 = await createTestOrder()
    const id2 = await createTestOrder()

    // Submit order 2 first so it can't be submitted again
    await ctx.service.submitPrintifyOrder(id2, apiClient)

    const result = await ctx.service.bulkSubmitOrders([id1, id2], apiClient)

    expect(result.success_count).toBe(1)
    expect(result.failure_count).toBe(1)
    expect(result.failed_orders[0].order_id).toBe(id2)
  })

  it("should bulk cancel multiple orders", async () => {
    const id1 = await createTestOrder()
    const id2 = await createTestOrder()

    const result = await ctx.service.bulkCancelOrders([id1, id2], apiClient, "Batch cancel")

    expect(result.success_count).toBe(2)
    expect(result.failure_count).toBe(0)

    // Verify both orders are cancelled
    const order1 = await ctx.service.getOrderBridge(id1)
    const order2 = await ctx.service.getOrderBridge(id2)
    expect(order1.status).toBe("cancelled")
    expect(order2.status).toBe("cancelled")
  })

  it("should handle partial cancel failures (already cancelled)", async () => {
    const id1 = await createTestOrder()
    const id2 = await createTestOrder()

    // Cancel order 2 first
    await ctx.service.cancelPrintifyOrder(id2, apiClient)

    const result = await ctx.service.bulkCancelOrders([id1, id2], apiClient)

    expect(result.success_count).toBe(1)
    expect(result.failure_count).toBe(1)
    expect(result.failed_orders[0].order_id).toBe(id2)
  })

  it("should bulk retry FAILED orders", async () => {
    const id1 = await createTestOrder()
    const id2 = await createTestOrder()

    // Manually set orders to FAILED status
    ctx.stores.orders.update([
      { id: id1, status: "failed", retry_count: 3, error_details: "API error", last_error_at: new Date() },
      { id: id2, status: "failed", retry_count: 2, error_details: "Timeout", last_error_at: new Date() },
    ])

    const result = await ctx.service.bulkRetryOrders([id1, id2])

    expect(result.success_count).toBe(2)
    expect(result.failure_count).toBe(0)

    // Verify orders are reset to pending
    const order1 = await ctx.service.getOrderBridge(id1)
    const order2 = await ctx.service.getOrderBridge(id2)
    expect(order1.status).toBe("pending")
    expect(order2.status).toBe("pending")
  })

  it("should skip non-FAILED orders during bulk retry", async () => {
    const id1 = await createTestOrder()
    const id2 = await createTestOrder()

    // Only set order 1 to FAILED
    ctx.stores.orders.update([
      { id: id1, status: "failed", retry_count: 3, error_details: "API error", last_error_at: new Date() },
    ])

    const result = await ctx.service.bulkRetryOrders([id1, id2])

    expect(result.success_count).toBe(1)
    expect(result.failure_count).toBe(1)
    expect(result.failed_orders[0].order_id).toBe(id2)
    expect(result.failed_orders[0].error).toContain("not in FAILED status")
  })

  it("should handle full lifecycle: create -> bulk submit -> fail -> bulk retry -> bulk submit", async () => {
    const id1 = await createTestOrder()
    const id2 = await createTestOrder()

    // Step 1: Bulk submit
    const submitResult = await ctx.service.bulkSubmitOrders([id1, id2], apiClient)
    expect(submitResult.success_count).toBe(2)

    // Step 2: Simulate failure
    ctx.stores.orders.update([
      { id: id1, status: "failed", retry_count: 3, error_details: "Production error", last_error_at: new Date() },
      { id: id2, status: "failed", retry_count: 2, error_details: "Timeout", last_error_at: new Date() },
    ])

    // Step 3: Bulk retry
    const retryResult = await ctx.service.bulkRetryOrders([id1, id2])
    expect(retryResult.success_count).toBe(2)

    // Step 4: Bulk submit again
    const resubmitResult = await ctx.service.bulkSubmitOrders([id1, id2], apiClient)
    expect(resubmitResult.success_count).toBe(2)

    // Final state: both submitted
    const order1 = await ctx.service.getOrderBridge(id1)
    const order2 = await ctx.service.getOrderBridge(id2)
    expect(order1.status).toBe("submitted")
    expect(order2.status).toBe("submitted")
  })
})
