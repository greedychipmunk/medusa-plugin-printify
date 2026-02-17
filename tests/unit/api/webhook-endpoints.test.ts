/**
 * Unit Tests: Webhook Endpoints
 *
 * Tests for Printify webhook handler including signature verification,
 * event routing, and individual event handlers with properly mocked services.
 */

import crypto from "crypto"

import { POST } from "../../../src/api/webhooks/printify/route"

const WEBHOOK_SECRET = "test-webhook-secret"

function sign(body: string, secret: string = WEBHOOK_SECRET): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")
}

function buildMockService(overrides: Record<string, any> = {}) {
  return {
    listPrintifyConfigurations: jest.fn().mockResolvedValue([
      {
        id: "config-1",
        printify_api_key: "pk_test",
        printify_shop_id: "shop-1",
        webhook_secret: WEBHOOK_SECRET,
      },
    ]),
    getOrderByPrintifyId: jest.fn().mockResolvedValue(null),
    mapPrintifyStatus: jest.fn((s: string) => {
      const map: Record<string, string> = {
        pending: "submitted",
        "in-production": "processing",
        shipped: "shipped",
        delivered: "delivered",
        canceled: "cancelled",
        failed: "failed",
      }
      return map[s] || "processing"
    }),
    updateOrderStatus: jest.fn().mockResolvedValue({}),
    listPrintifyProducts: jest.fn().mockResolvedValue([]),
    updatePrintifyProducts: jest.fn().mockResolvedValue([]),
    disableProduct: jest.fn().mockResolvedValue({}),
    ...overrides,
  }
}

function buildReqRes(body: any, service: any, includeSignature = true) {
  const bodyStr = JSON.stringify(body)
  const req: any = {
    body,
    headers: {},
    scope: {
      resolve: jest.fn().mockReturnValue(service),
    },
  }
  if (includeSignature) {
    req.headers["x-printify-signature"] = sign(bodyStr)
  }

  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }

  return { req, res }
}

describe("Webhook Endpoints", () => {
  describe("POST /webhooks/printify", () => {
    // 1. Verifies valid HMAC-SHA256 signature
    it("should accept request with valid HMAC-SHA256 signature", async () => {
      const service = buildMockService()
      const body = { type: "shop:disconnected", resource: { id: "r1", type: "shop", data: { id: "s1", shop_id: "shop-1" } }, created_at: "2026-01-01T00:00:00Z" }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true })
    })

    // 2. Rejects invalid signature with 401
    it("should reject request with invalid signature", async () => {
      const service = buildMockService()
      const body = { type: "order:status-changed", resource: { id: "r1", type: "order", data: { id: "o1", status: "shipped", shop_id: "s1" } }, created_at: "2026-01-01T00:00:00Z" }
      const { req, res } = buildReqRes(body, service)
      req.headers["x-printify-signature"] = "invalid-signature"

      await POST(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid signature" })
    })

    // 3. Returns 400 for missing event type
    it("should return 400 for missing event type", async () => {
      const service = buildMockService()
      const body = { resource: {} }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid event payload" })
    })

    // 4. order:status-changed updates order status
    it("should update order status on order:status-changed", async () => {
      const mockOrder = { id: "order-1", status: "submitted" }
      const service = buildMockService({
        getOrderByPrintifyId: jest.fn().mockResolvedValue(mockOrder),
        mapPrintifyStatus: jest.fn().mockReturnValue("shipped"),
      })

      const body = {
        type: "order:status-changed",
        resource: { id: "r1", type: "order", data: { id: "printify-123", status: "shipped", shop_id: "s1" } },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(service.getOrderByPrintifyId).toHaveBeenCalledWith("printify-123")
      expect(service.updateOrderStatus).toHaveBeenCalledWith("order-1", {
        status: "shipped",
        note: "Status updated via webhook: shipped",
      })
      expect(res.status).toHaveBeenCalledWith(200)
    })

    // 5. order:status-changed skips when order not found
    it("should skip update when order not found for status-changed", async () => {
      const service = buildMockService({
        getOrderByPrintifyId: jest.fn().mockResolvedValue(null),
      })

      const body = {
        type: "order:status-changed",
        resource: { id: "r1", type: "order", data: { id: "unknown-order", status: "shipped", shop_id: "s1" } },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(service.updateOrderStatus).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })

    // 6. order:status-changed skips when status unchanged
    it("should skip update when status is unchanged", async () => {
      const mockOrder = { id: "order-1", status: "processing" }
      const service = buildMockService({
        getOrderByPrintifyId: jest.fn().mockResolvedValue(mockOrder),
        mapPrintifyStatus: jest.fn().mockReturnValue("processing"),
      })

      const body = {
        type: "order:status-changed",
        resource: { id: "r1", type: "order", data: { id: "printify-123", status: "in-production", shop_id: "s1" } },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(service.updateOrderStatus).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })

    // 7. order:shipped updates tracking info
    it("should update tracking info on order:shipped", async () => {
      const mockOrder = { id: "order-1", status: "processing" }
      const service = buildMockService({
        getOrderByPrintifyId: jest.fn().mockResolvedValue(mockOrder),
        mapPrintifyStatus: jest.fn().mockReturnValue("shipped"),
      })

      const body = {
        type: "order:shipped",
        resource: {
          id: "r1",
          type: "order",
          data: {
            id: "printify-123",
            status: "shipped",
            shop_id: "s1",
            tracking: { tracking_number: "TRACK-1", tracking_url: "https://track.me/1", carrier: "UPS" },
          },
        },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(service.updateOrderStatus).toHaveBeenCalledWith("order-1", expect.objectContaining({
        status: "shipped",
        trackingNumber: "TRACK-1",
        trackingUrl: "https://track.me/1",
        carrier: "UPS",
      }))
      expect(res.status).toHaveBeenCalledWith(200)
    })

    // 8. order:shipped handles missing order
    it("should handle missing order on order:shipped gracefully", async () => {
      const service = buildMockService({
        getOrderByPrintifyId: jest.fn().mockResolvedValue(null),
      })

      const body = {
        type: "order:shipped",
        resource: {
          id: "r1",
          type: "order",
          data: {
            id: "unknown-order",
            status: "shipped",
            shop_id: "s1",
            tracking: { tracking_number: "T1", tracking_url: "https://t.co/1", carrier: "FedEx" },
          },
        },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(service.updateOrderStatus).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })

    // 9. product:updated triggers immediate sync
    it("should trigger immediate sync on product:updated", async () => {
      const mockGetProduct = jest.fn().mockResolvedValue({
        id: "printify-prod-1",
        title: "Updated T-Shirt",
        description: "New description",
        tags: ["tag1"],
        images: [{ src: "img.png", variant_ids: [], position: "front", is_default: true }],
      })

      const service = buildMockService({
        listPrintifyProducts: jest.fn().mockResolvedValue([{ id: "local-1", printify_product_id: "printify-prod-1" }]),
        getApiClientForConfig: jest.fn().mockResolvedValue({ getProduct: mockGetProduct }),
      })

      const body = {
        type: "product:updated",
        resource: { id: "r1", type: "product", data: { id: "printify-prod-1", shop_id: "s1" } },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(mockGetProduct).toHaveBeenCalledWith("printify-prod-1")
      expect(service.updatePrintifyProducts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: "local-1",
            title: "Updated T-Shirt",
            description: "New description",
          }),
        ])
      )
      expect(res.status).toHaveBeenCalledWith(200)
    })

    // 10. product:updated skips untracked products
    it("should skip untracked products on product:updated", async () => {
      const service = buildMockService({
        listPrintifyProducts: jest.fn().mockResolvedValue([]),
      })

      const body = {
        type: "product:updated",
        resource: { id: "r1", type: "product", data: { id: "unknown-product", shop_id: "s1" } },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(service.updatePrintifyProducts).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })

    // 11. product:deleted disables local product
    it("should disable local product on product:deleted", async () => {
      const service = buildMockService({
        listPrintifyProducts: jest.fn().mockResolvedValue([{ id: "local-1", printify_product_id: "printify-del-1" }]),
      })

      const body = {
        type: "product:deleted",
        resource: { id: "r1", type: "product", data: { id: "printify-del-1", shop_id: "s1" } },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(service.disableProduct).toHaveBeenCalledWith("local-1", "webhook", "Product deleted on Printify")
      expect(res.status).toHaveBeenCalledWith(200)
    })

    // 12. order:sent-to-production updates to PROCESSING
    it("should update order to PROCESSING on order:sent-to-production", async () => {
      const mockOrder = { id: "order-1", status: "submitted" }
      const service = buildMockService({
        getOrderByPrintifyId: jest.fn().mockResolvedValue(mockOrder),
      })

      const body = {
        type: "order:sent-to-production",
        resource: { id: "r1", type: "order", data: { id: "printify-o1", status: "in-production", shop_id: "s1" } },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(service.updateOrderStatus).toHaveBeenCalledWith("order-1", {
        status: "processing",
        note: "Order sent to production via webhook",
      })
      expect(res.status).toHaveBeenCalledWith(200)
    })

    // 13. order:shipment:delivered updates to DELIVERED
    it("should update order to DELIVERED on order:shipment:delivered", async () => {
      const mockOrder = { id: "order-1", status: "shipped" }
      const service = buildMockService({
        getOrderByPrintifyId: jest.fn().mockResolvedValue(mockOrder),
      })

      const body = {
        type: "order:shipment:delivered",
        resource: { id: "r1", type: "order", data: { id: "printify-o1", status: "delivered", shop_id: "s1" } },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(service.updateOrderStatus).toHaveBeenCalledWith("order-1", {
        status: "delivered",
        note: "Shipment delivered via webhook",
      })
      expect(res.status).toHaveBeenCalledWith(200)
    })

    // 14. shop:disconnected logs warning only
    it("should handle shop:disconnected without service mutations", async () => {
      const service = buildMockService()

      const body = {
        type: "shop:disconnected",
        resource: { id: "r1", type: "shop", data: { id: "shop-1", shop_id: "shop-1" } },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(service.updateOrderStatus).not.toHaveBeenCalled()
      expect(service.updatePrintifyProducts).not.toHaveBeenCalled()
      expect(service.disableProduct).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })

    // 15. Unknown event type returns 200
    it("should return 200 for unknown event types", async () => {
      const service = buildMockService()
      const body = {
        type: "some:future:event",
        resource: { id: "r1", type: "unknown", data: { id: "x1" } },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true })
    })

    // 16. Processing errors still return 200
    it("should return 200 even when handler throws", async () => {
      const service = buildMockService({
        getOrderByPrintifyId: jest.fn().mockRejectedValue(new Error("DB down")),
      })

      const body = {
        type: "order:status-changed",
        resource: { id: "r1", type: "order", data: { id: "printify-123", status: "shipped", shop_id: "s1" } },
        created_at: "2026-01-01T00:00:00Z",
      }
      const { req, res } = buildReqRes(body, service)

      await POST(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ received: true })
    })
  })
})
