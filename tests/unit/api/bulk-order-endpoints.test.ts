/**
 * Unit Tests: Bulk Order API Endpoints
 *
 * Tests for bulk-submit, bulk-cancel, and bulk-retry order endpoints.
 */

import { POST as bulkSubmitPOST } from "../../../src/api/admin/printify/orders/bulk-submit/route"
import { POST as bulkCancelPOST } from "../../../src/api/admin/printify/orders/bulk-cancel/route"
import { POST as bulkRetryPOST } from "../../../src/api/admin/printify/orders/bulk-retry/route"

function buildMockService(overrides: Record<string, any> = {}) {
  return {
    listPrintifyConfigurations: jest.fn().mockResolvedValue([{ id: "config-1", printify_api_key: "key", printify_shop_id: "shop" }]),
    getApiClientForConfig: jest.fn().mockResolvedValue({}),
    bulkSubmitOrders: jest.fn().mockResolvedValue({ success_count: 2, failure_count: 0, failed_orders: [] }),
    bulkCancelOrders: jest.fn().mockResolvedValue({ success_count: 2, failure_count: 0, failed_orders: [] }),
    bulkRetryOrders: jest.fn().mockResolvedValue({ success_count: 2, failure_count: 0, failed_orders: [] }),
    ...overrides,
  }
}

function buildReq(body: any, service: any): any {
  return {
    body,
    auth_context: { actor_id: "admin-user" },
    scope: { resolve: jest.fn().mockReturnValue(service) },
  }
}

function buildRes(): any {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
}

describe("POST /admin/printify/orders/bulk-submit", () => {
  it("should reject empty order_ids array", async () => {
    const service = buildMockService()
    const req = buildReq({ order_ids: [] }, service)
    const res = buildRes()

    await bulkSubmitPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Validation error" })
    )
  })

  it("should reject more than 100 order_ids", async () => {
    const service = buildMockService()
    const ids = Array.from({ length: 101 }, (_, i) => `order-${i}`)
    const req = buildReq({ order_ids: ids }, service)
    const res = buildRes()

    await bulkSubmitPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Validation error" })
    )
  })

  it("should return 400 when no configuration exists", async () => {
    const service = buildMockService({
      listPrintifyConfigurations: jest.fn().mockResolvedValue([]),
    })
    const req = buildReq({ order_ids: ["order-1"] }, service)
    const res = buildRes()

    await bulkSubmitPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "No configuration found" })
    )
  })

  it("should call bulkSubmitOrders and return success response", async () => {
    const service = buildMockService()
    const req = buildReq({ order_ids: ["order-1", "order-2"] }, service)
    const res = buildRes()

    await bulkSubmitPOST(req, res)

    expect(service.bulkSubmitOrders).toHaveBeenCalledWith(
      ["order-1", "order-2"],
      expect.anything()
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          success_count: 2,
          failure_count: 0,
          failed_orders: [],
        }),
      })
    )
  })

  it("should return partial failures in response", async () => {
    const service = buildMockService({
      bulkSubmitOrders: jest.fn().mockResolvedValue({
        success_count: 1,
        failure_count: 1,
        failed_orders: [{ order_id: "order-2", error: "Cannot submit" }],
      }),
    })
    const req = buildReq({ order_ids: ["order-1", "order-2"] }, service)
    const res = buildRes()

    await bulkSubmitPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          success_count: 1,
          failure_count: 1,
          failed_orders: [{ order_id: "order-2", error: "Cannot submit" }],
        }),
      })
    )
  })
})

describe("POST /admin/printify/orders/bulk-cancel", () => {
  it("should reject empty order_ids array", async () => {
    const service = buildMockService()
    const req = buildReq({ order_ids: [] }, service)
    const res = buildRes()

    await bulkCancelPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Validation error" })
    )
  })

  it("should reject more than 100 order_ids", async () => {
    const service = buildMockService()
    const ids = Array.from({ length: 101 }, (_, i) => `order-${i}`)
    const req = buildReq({ order_ids: ids }, service)
    const res = buildRes()

    await bulkCancelPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("should call bulkCancelOrders with reason and return success", async () => {
    const service = buildMockService()
    const req = buildReq({ order_ids: ["order-1", "order-2"], reason: "Out of stock" }, service)
    const res = buildRes()

    await bulkCancelPOST(req, res)

    expect(service.bulkCancelOrders).toHaveBeenCalledWith(
      ["order-1", "order-2"],
      expect.anything(),
      "Out of stock"
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ success_count: 2, failure_count: 0 }),
      })
    )
  })

  it("should return 400 when no configuration exists", async () => {
    const service = buildMockService({
      listPrintifyConfigurations: jest.fn().mockResolvedValue([]),
    })
    const req = buildReq({ order_ids: ["order-1"] }, service)
    const res = buildRes()

    await bulkCancelPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("should handle partial cancel failures", async () => {
    const service = buildMockService({
      bulkCancelOrders: jest.fn().mockResolvedValue({
        success_count: 1,
        failure_count: 1,
        failed_orders: [{ order_id: "order-2", error: "Already shipped" }],
      }),
    })
    const req = buildReq({ order_ids: ["order-1", "order-2"] }, service)
    const res = buildRes()

    await bulkCancelPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failure_count: 1,
          failed_orders: [expect.objectContaining({ order_id: "order-2" })],
        }),
      })
    )
  })
})

describe("POST /admin/printify/orders/bulk-retry", () => {
  it("should reject empty order_ids array", async () => {
    const service = buildMockService()
    const req = buildReq({ order_ids: [] }, service)
    const res = buildRes()

    await bulkRetryPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Validation error" })
    )
  })

  it("should reject more than 100 order_ids", async () => {
    const service = buildMockService()
    const ids = Array.from({ length: 101 }, (_, i) => `order-${i}`)
    const req = buildReq({ order_ids: ids }, service)
    const res = buildRes()

    await bulkRetryPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("should call bulkRetryOrders and return success", async () => {
    const service = buildMockService()
    const req = buildReq({ order_ids: ["order-1", "order-2"] }, service)
    const res = buildRes()

    await bulkRetryPOST(req, res)

    expect(service.bulkRetryOrders).toHaveBeenCalledWith(["order-1", "order-2"])
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ success_count: 2, failure_count: 0 }),
      })
    )
  })

  it("should handle partial retry failures (non-FAILED orders)", async () => {
    const service = buildMockService({
      bulkRetryOrders: jest.fn().mockResolvedValue({
        success_count: 1,
        failure_count: 1,
        failed_orders: [{ order_id: "order-2", error: "Order is not in FAILED status (current: pending)" }],
      }),
    })
    const req = buildReq({ order_ids: ["order-1", "order-2"] }, service)
    const res = buildRes()

    await bulkRetryPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          success_count: 1,
          failure_count: 1,
        }),
      })
    )
  })

  it("should return 500 on unexpected error", async () => {
    const service = buildMockService({
      bulkRetryOrders: jest.fn().mockRejectedValue(new Error("DB connection lost")),
    })
    const req = buildReq({ order_ids: ["order-1"] }, service)
    const res = buildRes()

    await bulkRetryPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Internal server error" })
    )
  })
})
