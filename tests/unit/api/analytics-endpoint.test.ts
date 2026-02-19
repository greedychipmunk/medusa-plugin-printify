/**
 * Unit Tests: GET /admin/printify/analytics endpoint
 */

import { GET } from "../../../src/api/admin/printify/analytics/route"

function buildMockService(analyticsResult: any = null, shouldThrow = false) {
  return {
    getAnalyticsForConfig: jest.fn().mockImplementation(() => {
      if (shouldThrow) throw new Error("Service error")
      return analyticsResult
    }),
  }
}

const DEFAULT_ANALYTICS = {
  date_range: {},
  sales_summary: {
    total_revenue: 50000,
    total_orders: 5,
    avg_order_value: 10000,
    total_shipping: 2500,
    total_tax: 3000,
    total_discounts: 500,
    currency: "USD",
  },
  fulfillment_metrics: {
    orders_by_status: { pending: 1, shipped: 2, delivered: 2 },
    avg_processing_time_hours: 24,
    avg_delivery_time_hours: 24,
    fulfillment_rate: 0.8,
  },
  top_products: [],
}

function buildReq(query: any = {}, service: any = buildMockService()): any {
  return {
    query,
    scope: { resolve: jest.fn().mockReturnValue(service) },
  }
}

function buildRes(): any {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
}

describe("GET /admin/printify/analytics", () => {
  // 1. Returns success with no date params
  it("should return analytics with no date params", async () => {
    const service = buildMockService(DEFAULT_ANALYTICS)
    const req = buildReq({}, service)
    const res = buildRes()

    await GET(req, res)

    expect(service.getAnalyticsForConfig).toHaveBeenCalledWith(undefined, undefined, undefined)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          sales_summary: expect.objectContaining({ total_revenue: 50000 }),
        }),
      }),
    )
  })

  // 2. Passes valid date range to service
  it("should pass valid date range to service", async () => {
    const service = buildMockService(DEFAULT_ANALYTICS)
    const req = buildReq({ date_from: "2026-01-01", date_to: "2026-01-31" }, service)
    const res = buildRes()

    await GET(req, res)

    expect(service.getAnalyticsForConfig).toHaveBeenCalledWith(
      undefined,
      expect.any(Date),
      expect.any(Date),
    )
    const [, dateFrom, dateTo] = service.getAnalyticsForConfig.mock.calls[0]
    expect(dateFrom.toISOString()).toContain("2026-01-01")
    expect(dateTo.toISOString()).toContain("2026-01-31")
  })

  // 3. Returns 400 for invalid date_from
  it("should return 400 for invalid date_from", async () => {
    const service = buildMockService(DEFAULT_ANALYTICS)
    const req = buildReq({ date_from: "not-a-date" }, service)
    const res = buildRes()

    await GET(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Validation error" }),
    )
    expect(service.getAnalyticsForConfig).not.toHaveBeenCalled()
  })

  // 4. Passes config_id through
  it("should pass config_id to service", async () => {
    const service = buildMockService(DEFAULT_ANALYTICS)
    const req = buildReq({ config_id: "cfg-123" }, service)
    const res = buildRes()

    await GET(req, res)

    expect(service.getAnalyticsForConfig).toHaveBeenCalledWith("cfg-123", undefined, undefined)
  })

  // 5. Returns 500 when service throws
  it("should return 500 when service throws", async () => {
    const service = buildMockService(null, true)
    const req = buildReq({}, service)
    const res = buildRes()

    await GET(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Internal server error" }),
    )
  })

  // 6. Response shape validation
  it("should return correct response shape", async () => {
    const service = buildMockService(DEFAULT_ANALYTICS)
    const req = buildReq({}, service)
    const res = buildRes()

    await GET(req, res)

    const response = res.json.mock.calls[0][0]
    expect(response.success).toBe(true)
    expect(response.data).toHaveProperty("date_range")
    expect(response.data).toHaveProperty("sales_summary")
    expect(response.data).toHaveProperty("fulfillment_metrics")
    expect(response.data).toHaveProperty("top_products")
    expect(response.data.sales_summary).toHaveProperty("total_revenue")
    expect(response.data.sales_summary).toHaveProperty("currency")
    expect(response.data.fulfillment_metrics).toHaveProperty("fulfillment_rate")
  })
})
