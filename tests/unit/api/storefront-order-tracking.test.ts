/**
 * Unit Tests: Storefront Order Tracking Endpoint
 *
 * Tests for POST /store/printify/orders/track — customers look up
 * their Printify order status and tracking info by email + order ID.
 */

import { POST as trackOrder } from "../../../src/api/store/printify/orders/track/route"

function makeOrderBridge(overrides: Record<string, any> = {}) {
  return {
    id: "printify_order_123",
    medusaOrderId: "order_456",
    status: "shipped",
    items: [{ title: "Test T-Shirt", quantity: 1 }],
    shippingAddress: {
      first_name: "Jane",
      city: "Portland",
      country: "US",
    },
    tracking: {
      tracking_number: "1Z999AA10123456784",
      tracking_url: "https://ups.com/track/1Z999AA10123456784",
      carrier: "UPS",
    },
    createdAt: "2026-01-15T10:00:00Z",
    updatedAt: "2026-01-16T14:30:00Z",
    ...overrides,
  }
}

function buildMockService(overrides: Record<string, any> = {}) {
  return {
    getOrderByMedusaIdForCustomer: jest.fn().mockResolvedValue(makeOrderBridge()),
    ...overrides,
  }
}

function buildReqRes(service: any, body: any = {}) {
  const req: any = {
    body,
    scope: {
      resolve: jest.fn().mockReturnValue(service),
    },
  }
  const res: any = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  }
  return { req, res }
}

describe("POST /store/printify/orders/track", () => {
  it("returns order with tracking data on success", async () => {
    const service = buildMockService()
    const { req, res } = buildReqRes(service, {
      email: "jane@example.com",
      order_id: "order_456",
    })

    await trackOrder(req, res)

    expect(res.json).toHaveBeenCalledWith({
      data: {
        order: {
          id: "printify_order_123",
          medusa_order_id: "order_456",
          status: "shipped",
          items: [{ title: "Test T-Shirt", quantity: 1 }],
          shipping_address: {
            first_name: "Jane",
            city: "Portland",
            country: "US",
          },
          tracking: {
            tracking_number: "1Z999AA10123456784",
            tracking_url: "https://ups.com/track/1Z999AA10123456784",
            carrier: "UPS",
          },
          created_at: "2026-01-15T10:00:00Z",
          updated_at: "2026-01-16T14:30:00Z",
        },
      },
    })
    expect(res.status).not.toHaveBeenCalled()
  })

  it("returns order with no tracking when status is pending", async () => {
    const service = buildMockService({
      getOrderByMedusaIdForCustomer: jest.fn().mockResolvedValue(
        makeOrderBridge({ status: "pending", tracking: null })
      ),
    })
    const { req, res } = buildReqRes(service, {
      email: "jane@example.com",
      order_id: "order_456",
    })

    await trackOrder(req, res)

    const body = res.json.mock.calls[0][0]
    expect(body.data.order.status).toBe("pending")
    expect(body.data.order.tracking).toBeNull()
  })

  it("returns 400 for invalid email format", async () => {
    const service = buildMockService()
    const { req, res } = buildReqRes(service, {
      email: "not-an-email",
      order_id: "order_456",
    })

    await trackOrder(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Validation failed" })
    )
  })

  it("returns 400 for missing order_id", async () => {
    const service = buildMockService()
    const { req, res } = buildReqRes(service, {
      email: "jane@example.com",
    })

    await trackOrder(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 400 for empty body", async () => {
    const service = buildMockService()
    const { req, res } = buildReqRes(service, {})

    await trackOrder(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 404 when order not found", async () => {
    const service = buildMockService({
      getOrderByMedusaIdForCustomer: jest.fn().mockResolvedValue(null),
    })
    const { req, res } = buildReqRes(service, {
      email: "jane@example.com",
      order_id: "nonexistent_order",
    })

    await trackOrder(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Order not found",
    })
  })

  it("returns 404 for email mismatch (same as not found)", async () => {
    const service = buildMockService({
      getOrderByMedusaIdForCustomer: jest.fn().mockResolvedValue(null),
    })
    const { req, res } = buildReqRes(service, {
      email: "wrong@example.com",
      order_id: "order_456",
    })

    await trackOrder(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Order not found",
    })
  })

  it("returns 500 when service throws", async () => {
    const service = buildMockService({
      getOrderByMedusaIdForCustomer: jest.fn().mockRejectedValue(new Error("DB down")),
    })
    const { req, res } = buildReqRes(service, {
      email: "jane@example.com",
      order_id: "order_456",
    })

    await trackOrder(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Internal server error",
    })
  })
})
