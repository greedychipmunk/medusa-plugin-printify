/**
 * Unit Tests: Webhook Admin Endpoints
 *
 * Tests for GET/POST /admin/printify/webhooks and
 * DELETE /admin/printify/webhooks/:id
 */

jest.mock("../../../src/modules/printify/services/printify-api-client", () => ({
  PrintifyApiClient: jest.fn().mockImplementation(() => ({
    listWebhooks: jest.fn(),
    createWebhook: jest.fn(),
    deleteWebhook: jest.fn(),
  })),
}))

import { GET, POST } from "../../../src/api/admin/printify/webhooks/route"
import { DELETE } from "../../../src/api/admin/printify/webhooks/[id]/route"
import { PrintifyApiClient } from "../../../src/modules/printify/services/printify-api-client"

function buildMockService(config: any = null) {
  return {
    listPrintifyConfigurations: jest.fn().mockResolvedValue(
      config
        ? [config]
        : [],
    ),
  }
}

const DEFAULT_CONFIG = {
  id: "config-1",
  printify_api_key: "pk_test",
  printify_shop_id: "shop-1",
  webhook_secret: "ws_test",
}

function buildReq(body: any = {}, params: any = {}, service: any = buildMockService()): any {
  return {
    body,
    params,
    auth_context: { actor_id: "admin-1" },
    scope: { resolve: jest.fn().mockReturnValue(service) },
  }
}

function buildRes(): any {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
}

describe("Webhook Admin Endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // 1. GET /admin/printify/webhooks returns webhook list
  it("GET should return webhook list", async () => {
    const mockWebhooks = [
      { id: "wh-1", topic: "order:shipped", url: "https://example.com/hook", shop_id: "shop-1", secret: "s1" },
    ]
    const mockListWebhooks = jest.fn().mockResolvedValue(mockWebhooks)
    ;(PrintifyApiClient as jest.Mock).mockImplementation(() => ({
      listWebhooks: mockListWebhooks,
    }))

    const service = buildMockService(DEFAULT_CONFIG)
    const req = buildReq({}, {}, service)
    const res = buildRes()

    await GET(req, res)

    expect(mockListWebhooks).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ webhooks: mockWebhooks })
  })

  // 2. GET handles missing configuration
  it("GET should return 404 when no configuration exists", async () => {
    const service = buildMockService() // no config
    const req = buildReq({}, {}, service)
    const res = buildRes()

    await GET(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Configuration not found" }),
    )
  })

  // 3. POST creates webhook with topic and url
  it("POST should create webhook with topic and url", async () => {
    const mockWebhook = { id: "wh-new", topic: "order:shipped", url: "https://example.com/hook", shop_id: "shop-1", secret: "ws_test" }
    const mockCreateWebhook = jest.fn().mockResolvedValue(mockWebhook)
    ;(PrintifyApiClient as jest.Mock).mockImplementation(() => ({
      createWebhook: mockCreateWebhook,
    }))

    const service = buildMockService(DEFAULT_CONFIG)
    const req = buildReq({ topic: "order:shipped", url: "https://example.com/hook" }, {}, service)
    const res = buildRes()

    await POST(req, res)

    expect(mockCreateWebhook).toHaveBeenCalledWith("order:shipped", "https://example.com/hook", "ws_test")
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({ webhook: mockWebhook })
  })

  // 4. POST returns error for missing fields
  it("POST should return 400 for missing topic or url", async () => {
    const service = buildMockService(DEFAULT_CONFIG)
    const req = buildReq({ topic: "order:shipped" }, {}, service) // missing url
    const res = buildRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Validation error" }),
    )
  })

  // 5. DELETE removes webhook by ID
  it("DELETE should remove webhook by ID", async () => {
    const mockDeleteWebhook = jest.fn().mockResolvedValue(undefined)
    ;(PrintifyApiClient as jest.Mock).mockImplementation(() => ({
      deleteWebhook: mockDeleteWebhook,
    }))

    const service = buildMockService(DEFAULT_CONFIG)
    const req = buildReq({}, { id: "wh-123" }, service)
    const res = buildRes()

    await DELETE(req, res)

    expect(mockDeleteWebhook).toHaveBeenCalledWith("wh-123")
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ success: true })
  })
})
