/**
 * Unit Tests: Variant Availability Endpoint
 *
 * POST /store/printify/products/:id/availability
 */

import { POST } from "../../../src/api/store/printify/products/[id]/availability/route"

function buildMockService(overrides: Record<string, any> = {}) {
  return {
    getVariantAvailability: jest.fn().mockResolvedValue({
      variants: [
        {
          id: 1001,
          title: "Small",
          sku: "TSH-S",
          price: 2500,
          compare_at_price: 800,
          options: { Size: "S" },
          is_available: true,
          is_enabled: true,
          images: ["https://images.printify.com/tshirt.jpg"],
        },
      ],
      cached: false,
      fetched_at: new Date("2026-01-15T00:00:00Z"),
    }),
    ...overrides,
  }
}

function buildReqRes(
  service: any,
  opts: { params?: Record<string, any>; body?: any } = {}
) {
  const req: any = {
    params: opts.params || {},
    body: opts.body || {},
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

describe("POST /store/printify/products/:id/availability", () => {
  // 1. Returns availability on cache miss
  it("should return variant availability", async () => {
    const service = buildMockService()
    const { req, res } = buildReqRes(service, { params: { id: "prod-1" } })

    await POST(req, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: "prod-1",
        variants: expect.arrayContaining([
          expect.objectContaining({ id: 1001, is_available: true }),
        ]),
        cached: false,
      })
    )
  })

  // 2. Passes variant_ids filter to service
  it("should pass variant_ids filter", async () => {
    const service = buildMockService()
    const { req, res } = buildReqRes(service, {
      params: { id: "prod-1" },
      body: { variant_ids: ["1001", "1002"] },
    })

    await POST(req, res)

    expect(service.getVariantAvailability).toHaveBeenCalledWith("prod-1", ["1001", "1002"])
  })

  // 3. Returns cached response
  it("should return cached: true when cache hit", async () => {
    const service = buildMockService({
      getVariantAvailability: jest.fn().mockResolvedValue({
        variants: [{ id: 1001 }],
        cached: true,
        fetched_at: new Date("2026-01-15T00:00:00Z"),
      }),
    })
    const { req, res } = buildReqRes(service, { params: { id: "prod-1" } })

    await POST(req, res)

    const body = res.json.mock.calls[0][0]
    expect(body.cached).toBe(true)
  })

  // 4. Returns 404 for not found
  it("should return 404 for non-existent product", async () => {
    const notFoundError = new Error("Product not found or not enabled") as any
    notFoundError.code = "ENTITY_NOT_FOUND"
    const service = buildMockService({
      getVariantAvailability: jest.fn().mockRejectedValue(notFoundError),
    })
    const { req, res } = buildReqRes(service, { params: { id: "nonexistent" } })

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  // 5. Returns 400 for missing product ID
  it("should return 400 when product ID is missing", async () => {
    const service = buildMockService()
    const { req, res } = buildReqRes(service, { params: {} })

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  // 6. Returns 500 on unexpected error
  it("should return 500 on unexpected error", async () => {
    const service = buildMockService({
      getVariantAvailability: jest.fn().mockRejectedValue(new Error("DB down")),
    })
    const { req, res } = buildReqRes(service, { params: { id: "prod-1" } })

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
  })
})
