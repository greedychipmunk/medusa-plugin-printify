/**
 * Unit Tests: Shipping Rates Endpoint
 *
 * Tests for POST /store/printify/shipping/rates
 */

// Mock the API client before importing route
jest.mock("../../../src/modules/printify/services/printify-api-client", () => ({
  PrintifyApiClient: jest.fn().mockImplementation(() => ({
    calculateShipping: jest.fn(),
  })),
}))

// Mock the shipping cache
jest.mock("../../../src/modules/printify/utils/shipping-cache", () => {
  const mockGet = jest.fn().mockReturnValue(null)
  const mockSet = jest.fn()
  return {
    shippingRateCache: {
      get: mockGet,
      set: mockSet,
      clear: jest.fn(),
    },
  }
})

import { POST } from "../../../src/api/store/printify/shipping/rates/route"
import { PrintifyApiClient } from "../../../src/modules/printify/services/printify-api-client"
import { shippingRateCache } from "../../../src/modules/printify/utils/shipping-cache"

function buildService(overrides: Record<string, any> = {}) {
  return {
    listPrintifyConfigurations: jest.fn().mockResolvedValue([
      {
        id: "config-1",
        printify_api_key: "pk_test",
        printify_shop_id: "shop-1",
      },
    ]),
    ...overrides,
  }
}

function buildReqRes(body: any, service: any) {
  const req: any = {
    body,
    scope: {
      resolve: jest.fn().mockReturnValue(service),
    },
  }
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
  return { req, res }
}

const validBody = {
  line_items: [
    { printify_product_id: "prod-1", printify_variant_id: 100, quantity: 2 },
  ],
  address: {
    first_name: "John",
    last_name: "Doe",
    address1: "123 Main St",
    city: "New York",
    state_code: "NY",
    zip: "10001",
    country_code: "US",
  },
}

const mockRates = [
  { id: 1, name: "Standard", cost: 495, currency: "USD", estimated_delivery_min: 5, estimated_delivery_max: 7 },
]

describe("Shipping Rates Endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(shippingRateCache.get as jest.Mock).mockReturnValue(null)

    // Set up the mock API client instance
    ;(PrintifyApiClient as jest.Mock).mockImplementation(() => ({
      calculateShipping: jest.fn().mockResolvedValue(mockRates),
    }))
  })

  // 1. Returns shipping rates successfully
  it("should return shipping rates successfully", async () => {
    const service = buildService()
    const { req, res } = buildReqRes(validBody, service)

    await POST(req, res)

    expect(res.json).toHaveBeenCalledWith({
      shipping_options: mockRates,
      cached: false,
    })
  })

  // 2. Returns cached rates on second call
  it("should return cached rates when available", async () => {
    ;(shippingRateCache.get as jest.Mock).mockReturnValue(mockRates)
    const service = buildService()
    const { req, res } = buildReqRes(validBody, service)

    await POST(req, res)

    expect(res.json).toHaveBeenCalledWith({
      shipping_options: mockRates,
      cached: true,
    })
    // Should not have created an API client
    expect(PrintifyApiClient).not.toHaveBeenCalled()
  })

  // 3. Returns 400 for missing line items
  it("should return 400 for missing line items", async () => {
    const service = buildService()
    const body = { ...validBody, line_items: [] }
    const { req, res } = buildReqRes(body, service)

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Validation failed" }),
    )
  })

  // 4. Returns 400 for invalid country code
  it("should return 400 for invalid country code", async () => {
    const service = buildService()
    const body = {
      ...validBody,
      address: { ...validBody.address, country_code: "USA" },
    }
    const { req, res } = buildReqRes(body, service)

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  // 5. Returns 503 when not configured
  it("should return 503 when no configuration exists", async () => {
    const service = buildService({
      listPrintifyConfigurations: jest.fn().mockResolvedValue([]),
    })
    const { req, res } = buildReqRes(validBody, service)

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Printify integration not configured" }),
    )
  })

  // 6. Returns 502 for Printify API error
  it("should return 502 when Printify API fails", async () => {
    ;(PrintifyApiClient as jest.Mock).mockImplementation(() => ({
      calculateShipping: jest.fn().mockRejectedValue(new Error("Bad Gateway")),
    }))
    const service = buildService()
    const { req, res } = buildReqRes(validBody, service)

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Failed to fetch shipping rates from Printify" }),
    )
  })

  // 7. Returns 500 for unexpected errors
  it("should return 500 for unexpected errors", async () => {
    const service = buildService({
      listPrintifyConfigurations: jest.fn().mockRejectedValue(new Error("DB down")),
    })
    const { req, res } = buildReqRes(validBody, service)

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Internal server error" }),
    )
  })
})
