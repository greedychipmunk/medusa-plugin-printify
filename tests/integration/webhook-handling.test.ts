/**
 * Integration Tests: Webhook Handling
 *
 * Tests the webhook POST handler with signature verification,
 * event dispatching, and order/product status updates.
 * Uses the real webhook route handler with mocked req/res.
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

import crypto from "crypto"
import { createTestService, TestServiceContext } from "./helpers/test-service-factory"
import { setupAxiosMock, MockAxiosInstance, PRINTIFY_PRODUCT_UPDATED } from "./helpers/mock-printify-api"
import { POST } from "../../src/api/webhooks/printify/route"

// ── Helpers ────────────────────────────────────────────────────────

const WEBHOOK_SECRET = "test-webhook-secret-123"

function signBody(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")
}

function buildReqRes(
  ctx: TestServiceContext,
  body: any,
  signature?: string,
): { req: any; res: any; resBody: any } {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body)
  const resBody: { status?: number; body?: any } = {}

  const req = {
    body,
    headers: {
      "x-printify-signature": signature,
    },
    scope: {
      resolve: (_key: string) => ctx.service,
    },
  }

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockImplementation((data: any) => {
      resBody.body = data
    }),
  }

  return { req, res, resBody }
}

// ── Tests ──────────────────────────────────────────────────────────

describe("Integration: Webhook Handling", () => {
  let ctx: TestServiceContext
  let mockAxios: MockAxiosInstance

  beforeEach(() => {
    ctx = createTestService()
    mockAxios = setupAxiosMock()
  })

  it("accepts a valid signature and processes the event", async () => {
    ctx.stores.configurations.create([
      { id: "cfg_1", webhook_secret: WEBHOOK_SECRET, printify_api_key: "key", printify_shop_id: "12345" },
    ])

    const event = { type: "shop:disconnected", resource: { id: "r1", type: "shop", data: { id: "s1", shop_id: "12345" } }, created_at: "2026-01-01" }
    const body = JSON.stringify(event)
    const signature = signBody(body, WEBHOOK_SECRET)

    const { req, res } = buildReqRes(ctx, event, signature)
    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true })
  })

  it("rejects an invalid signature with 401", async () => {
    ctx.stores.configurations.create([
      { id: "cfg_2", webhook_secret: WEBHOOK_SECRET },
    ])

    const event = { type: "shop:disconnected", resource: { id: "r1", type: "shop", data: { id: "s1", shop_id: "12345" } }, created_at: "2026-01-01" }
    const { req, res } = buildReqRes(ctx, event, "invalid-signature")
    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid signature" })
  })

  it("skips verification when no secret is configured", async () => {
    ctx.stores.configurations.create([
      { id: "cfg_3", webhook_secret: null },
    ])

    const event = { type: "shop:disconnected", resource: { id: "r1", type: "shop", data: { id: "s1", shop_id: "12345" } }, created_at: "2026-01-01" }
    const { req, res } = buildReqRes(ctx, event)
    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("order:status-changed updates order status", async () => {
    ctx.stores.configurations.create([{ id: "cfg_4", webhook_secret: null }])
    ctx.stores.orders.create([
      {
        id: "ord_1",
        printify_order_id: "pfy_ord_100",
        medusa_order_id: "med_1",
        status: "submitted",
        total_price: 5000,
        line_items: [],
        shipping_address: {},
      },
    ])

    const event = {
      type: "order:status-changed",
      resource: { id: "r1", type: "order", data: { id: "pfy_ord_100", status: "in-production", shop_id: "12345" } },
      created_at: "2026-01-01",
    }

    const { req, res } = buildReqRes(ctx, event)
    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)

    const updated = ctx.stores.orders.retrieve("ord_1")
    expect(updated.status).toBe("processing")
  })

  it("order:shipped writes tracking info", async () => {
    ctx.stores.configurations.create([{ id: "cfg_5", webhook_secret: null }])
    ctx.stores.orders.create([
      {
        id: "ord_2",
        printify_order_id: "pfy_ord_200",
        medusa_order_id: "med_2",
        status: "processing",
        total_price: 3000,
        line_items: [],
        shipping_address: {},
      },
    ])

    const event = {
      type: "order:shipped",
      resource: {
        id: "r2",
        type: "order",
        data: {
          id: "pfy_ord_200",
          status: "shipped",
          shop_id: "12345",
          tracking: {
            tracking_number: "TRACK123",
            tracking_url: "https://track.example.com/TRACK123",
            carrier: "FedEx",
          },
        },
      },
      created_at: "2026-01-01",
    }

    const { req, res } = buildReqRes(ctx, event)
    await POST(req, res)

    const updated = ctx.stores.orders.retrieve("ord_2")
    expect(updated.status).toBe("shipped")
    expect(updated.tracking.trackingNumber).toBe("TRACK123")
    expect(updated.tracking.carrier).toBe("FedEx")
  })

  it("order:sent-to-production transitions to PROCESSING", async () => {
    ctx.stores.configurations.create([{ id: "cfg_6", webhook_secret: null }])
    ctx.stores.orders.create([
      {
        id: "ord_3",
        printify_order_id: "pfy_ord_300",
        medusa_order_id: "med_3",
        status: "submitted",
        total_price: 2000,
        line_items: [],
        shipping_address: {},
      },
    ])

    const event = {
      type: "order:sent-to-production",
      resource: { id: "r3", type: "order", data: { id: "pfy_ord_300", status: "in-production", shop_id: "12345" } },
      created_at: "2026-01-01",
    }

    const { req, res } = buildReqRes(ctx, event)
    await POST(req, res)

    const updated = ctx.stores.orders.retrieve("ord_3")
    expect(updated.status).toBe("processing")
  })

  it("order:shipment:delivered transitions to DELIVERED", async () => {
    ctx.stores.configurations.create([{ id: "cfg_7", webhook_secret: null }])
    ctx.stores.orders.create([
      {
        id: "ord_4",
        printify_order_id: "pfy_ord_400",
        medusa_order_id: "med_4",
        status: "shipped",
        total_price: 4000,
        line_items: [],
        shipping_address: {},
      },
    ])

    const event = {
      type: "order:shipment:delivered",
      resource: { id: "r4", type: "order", data: { id: "pfy_ord_400", status: "delivered", shop_id: "12345" } },
      created_at: "2026-01-01",
    }

    const { req, res } = buildReqRes(ctx, event)
    await POST(req, res)

    const updated = ctx.stores.orders.retrieve("ord_4")
    expect(updated.status).toBe("delivered")
  })

  it("product:deleted disables the product", async () => {
    ctx.stores.configurations.create([{ id: "cfg_8", webhook_secret: null }])
    ctx.stores.products.create([
      {
        id: "pprod_del_1",
        printify_product_id: "pfy_prod_delete_me",
        configuration_id: "cfg_8",
        title: "Soon Deleted",
        enabled: true,
      },
    ])

    const event = {
      type: "product:deleted",
      resource: { id: "r5", type: "product", data: { id: "pfy_prod_delete_me", shop_id: "12345" } },
      created_at: "2026-01-01",
    }

    const { req, res } = buildReqRes(ctx, event)
    await POST(req, res)

    const updated = ctx.stores.products.retrieve("pprod_del_1")
    expect(updated.enabled).toBe(false)
  })

  it("unknown event type returns 200 with no side effects", async () => {
    ctx.stores.configurations.create([{ id: "cfg_9", webhook_secret: null }])

    const event = {
      type: "some:future-event",
      resource: { id: "r6", type: "unknown", data: { id: "x1", shop_id: "12345" } },
      created_at: "2026-01-01",
    }

    const { req, res } = buildReqRes(ctx, event)
    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true })
  })
})
