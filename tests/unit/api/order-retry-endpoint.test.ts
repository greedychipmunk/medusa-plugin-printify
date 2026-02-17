/**
 * Unit Tests: POST /admin/printify/orders/:id/retry endpoint
 */

import { POST } from "../../../src/api/admin/printify/orders/[id]/retry/route"

function buildMockService(order: any = null) {
  return {
    getOrderBridge: jest.fn().mockImplementation((id: string) => {
      if (!order) throw Object.assign(new Error("Not found"), { code: "ENTITY_NOT_FOUND" })
      return order
    }),
    updatePrintifyOrders: jest.fn().mockResolvedValue([{}]),
  }
}

function buildReq(orderId: string, service: any): any {
  return {
    params: { id: orderId },
    auth_context: { actor_id: "default-store" },
    scope: { resolve: jest.fn().mockReturnValue(service) },
  }
}

function buildRes(): any {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
}

describe("POST /admin/printify/orders/:id/retry", () => {
  // 1. Resets FAILED order back to PENDING with retry_count=0
  it("should reset FAILED order back to PENDING with retry_count=0", async () => {
    const service = buildMockService({ id: "order-1", status: "failed", entity: { error_details: "some error" } })
    const req = buildReq("order-1", service)
    const res = buildRes()

    await POST(req, res)

    expect(service.updatePrintifyOrders).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "order-1",
        status: "pending",
        retry_count: 0,
        error_details: null,
        last_error_at: null,
      }),
    ])
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          order: expect.objectContaining({
            status: "pending",
            retry_count: 0,
          }),
        }),
      }),
    )
  })

  // 2. Returns 400 when order is not in FAILED status
  it("should return 400 when order is not in FAILED status", async () => {
    const service = buildMockService({ id: "order-1", status: "pending", entity: {} })
    const req = buildReq("order-1", service)
    const res = buildRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "Invalid order status",
      }),
    )
    expect(service.updatePrintifyOrders).not.toHaveBeenCalled()
  })

  // 3. Returns 404 for non-existent order
  it("should return 404 for non-existent order", async () => {
    const service = buildMockService(null) // will throw ENTITY_NOT_FOUND
    const req = buildReq("non-existent", service)
    const res = buildRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "Order not found",
      }),
    )
  })

  // 4. Clears error_details and last_error_at on retry
  it("should clear error_details and last_error_at on retry", async () => {
    const service = buildMockService({
      id: "order-1",
      status: "failed",
      entity: { error_details: "API timeout", last_error_at: new Date() },
    })
    const req = buildReq("order-1", service)
    const res = buildRes()

    await POST(req, res)

    expect(service.updatePrintifyOrders).toHaveBeenCalledWith([
      expect.objectContaining({
        error_details: null,
        last_error_at: null,
      }),
    ])
  })
})
