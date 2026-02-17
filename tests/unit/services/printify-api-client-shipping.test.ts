/**
 * Unit Tests: PrintifyApiClient Shipping Methods
 *
 * Tests for calculateShipping method.
 */

import { PrintifyApiClient } from "../../../src/modules/printify/services/printify-api-client"

const mockPost = jest.fn()

jest.mock("axios", () => {
  return {
    __esModule: true,
    default: {
      create: jest.fn(),
    },
  }
})

import axios from "axios"

describe("PrintifyApiClient - Shipping Methods", () => {
  let client: PrintifyApiClient

  beforeEach(() => {
    mockPost.mockReset()

    ;(axios.create as jest.Mock).mockReturnValue({
      get: jest.fn(),
      post: mockPost,
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    })

    client = new PrintifyApiClient({
      apiKey: "test-key",
      shopId: "shop-123",
    })
  })

  const shippingRequest = {
    line_items: [{ product_id: "prod-1", variant_id: 100, quantity: 2 }],
    address_to: {
      first_name: "John",
      last_name: "Doe",
      address1: "123 Main St",
      city: "New York",
      state_code: "NY",
      zip: "10001",
      country_code: "US",
    },
  }

  // 1. Returns shipping rates from { shipping: [...] } format
  it("should return rates from wrapped shipping response", async () => {
    const rates = [
      { id: 1, name: "Standard", cost: 495, currency: "USD" },
      { id: 2, name: "Express", cost: 995, currency: "USD" },
    ]
    mockPost.mockResolvedValue({ data: { shipping: rates } })

    const result = await client.calculateShipping(shippingRequest)

    expect(mockPost).toHaveBeenCalledWith(
      "/shops/shop-123/orders/shipping.json",
      shippingRequest,
    )
    expect(result).toEqual(rates)
    expect(result).toHaveLength(2)
  })

  // 2. Returns shipping rates from direct array format
  it("should return rates from direct array response", async () => {
    const rates = [{ id: 1, name: "Standard", cost: 495, currency: "USD" }]
    mockPost.mockResolvedValue({ data: rates })

    const result = await client.calculateShipping(shippingRequest)

    expect(result).toEqual(rates)
  })

  // 3. Throws on invalid response format
  it("should throw on invalid response format", async () => {
    mockPost.mockResolvedValue({ data: { something: "else" } })

    await expect(client.calculateShipping(shippingRequest)).rejects.toThrow(
      "Invalid shipping response format",
    )
  })

  // 4. Propagates network errors
  it("should propagate network errors", async () => {
    mockPost.mockRejectedValue(new Error("Network Error"))

    await expect(client.calculateShipping(shippingRequest)).rejects.toThrow(
      "Network Error",
    )
  })
})
