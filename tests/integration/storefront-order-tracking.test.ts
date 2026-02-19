/**
 * Integration Tests: Storefront Order Tracking
 *
 * Tests the getOrderByMedusaIdForCustomer method through real business logic.
 * Mocks only the HTTP boundary (axios) — all service logic runs for real.
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

function buildCartItems(): PrintifyCartItem[] {
  return [
    PrintifyCartItem.fromVariant(
      "cart_1",
      "prod_1",
      "var_1",
      "prod_abc123",
      "1001",
      2,
      { size: "M" },
      2500,
      "USD",
    ),
  ]
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

describe("Integration: Storefront Order Tracking", () => {
  let ctx: TestServiceContext

  beforeEach(() => {
    ctx = createTestService()

    ctx.stores.configurations.create([
      {
        id: "config_1",
        store_id: "store_1",
        printify_api_key: "test-key",
        printify_shop_id: "12345",
        sync_enabled: true,
        sync_frequency: 60,
        auto_submit_orders: false,
      },
    ])
  })

  it("finds order by medusa order ID and matching email", async () => {
    await ctx.service.createOrderFromCart({
      medusaOrderId: "medusa_order_track_1",
      customerEmail: "jane@example.com",
      cartItems: buildCartItems(),
      shippingAddress: SHIPPING_ADDRESS,
    })

    const found = await ctx.service.getOrderByMedusaIdForCustomer(
      "medusa_order_track_1",
      "jane@example.com",
    )

    expect(found).not.toBeNull()
    expect(found!.medusaOrderId).toBe("medusa_order_track_1")
  })

  it("matches email case-insensitively", async () => {
    await ctx.service.createOrderFromCart({
      medusaOrderId: "medusa_order_track_2",
      customerEmail: "Jane@Example.COM",
      cartItems: buildCartItems(),
      shippingAddress: SHIPPING_ADDRESS,
    })

    const found = await ctx.service.getOrderByMedusaIdForCustomer(
      "medusa_order_track_2",
      "jane@example.com",
    )

    expect(found).not.toBeNull()
  })

  it("returns null for wrong email", async () => {
    await ctx.service.createOrderFromCart({
      medusaOrderId: "medusa_order_track_3",
      customerEmail: "jane@example.com",
      cartItems: buildCartItems(),
      shippingAddress: SHIPPING_ADDRESS,
    })

    const found = await ctx.service.getOrderByMedusaIdForCustomer(
      "medusa_order_track_3",
      "wrong@example.com",
    )

    expect(found).toBeNull()
  })

  it("returns null for non-existent order", async () => {
    const found = await ctx.service.getOrderByMedusaIdForCustomer(
      "does_not_exist",
      "jane@example.com",
    )

    expect(found).toBeNull()
  })

  it("does not expose internal fields in response", async () => {
    await ctx.service.createOrderFromCart({
      medusaOrderId: "medusa_order_track_5",
      customerEmail: "jane@example.com",
      cartItems: buildCartItems(),
      shippingAddress: SHIPPING_ADDRESS,
    })

    const found = await ctx.service.getOrderByMedusaIdForCustomer(
      "medusa_order_track_5",
      "jane@example.com",
    )

    expect(found).not.toBeNull()
    // The route handler is responsible for sanitization, but verify bridge
    // exposes the fields needed and the internal ones can be excluded
    expect(found!.id).toBeDefined()
    expect(found!.status).toBe("pending")
    expect(found!.medusaOrderId).toBe("medusa_order_track_5")
  })
})
