/**
 * Integration Tests: Shipping Rates
 *
 * Tests PrintifyApiClient.calculateShipping() and ShippingRateCache
 * interaction — cache misses, hits, format handling, and key generation.
 * Mocks only the HTTP boundary (axios).
 */

jest.mock("axios", () => ({
  __esModule: true,
  default: { create: jest.fn() },
}))

import { setupAxiosMock, MockAxiosInstance, PRINTIFY_SHIPPING_RATES } from "./helpers/mock-printify-api"
import { PrintifyApiClient } from "../../src/modules/printify/services/printify-api-client"
import { ShippingRateCache } from "../../src/modules/printify/utils/shipping-cache"

const LINE_ITEMS = [
  { product_id: "prod_abc123", variant_id: 1001, quantity: 2 },
]

const ADDRESS = {
  first_name: "Jane",
  last_name: "Doe",
  address1: "123 Main St",
  city: "Portland",
  state_code: "OR",
  zip: "97201",
  country_code: "US",
}

describe("Integration: Shipping Rates", () => {
  let mockAxios: MockAxiosInstance
  let cache: ShippingRateCache

  beforeEach(() => {
    mockAxios = setupAxiosMock()
    cache = new ShippingRateCache(15)
    cache.clear()
  })

  it("fetches shipping rates from API on cache miss", async () => {
    mockAxios.post.mockResolvedValueOnce({ data: PRINTIFY_SHIPPING_RATES })

    const client = new PrintifyApiClient({ apiKey: "test-key", shopId: "12345" })

    // Check cache first
    const cached = cache.get(LINE_ITEMS, ADDRESS)
    expect(cached).toBeNull()

    // Fetch from API
    const rates = await client.calculateShipping({ line_items: LINE_ITEMS, address_to: ADDRESS })

    expect(rates).toHaveLength(2)
    expect(rates[0].name).toBe("Standard Shipping")
    expect(rates[1].name).toBe("Express Shipping")
    expect(mockAxios.post).toHaveBeenCalledTimes(1)

    // Store in cache
    cache.set(LINE_ITEMS, ADDRESS, rates)
  })

  it("handles { shipping: [...] } wrapper format", async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { shipping: PRINTIFY_SHIPPING_RATES } })

    const client = new PrintifyApiClient({ apiKey: "test-key", shopId: "12345" })
    const rates = await client.calculateShipping({ line_items: LINE_ITEMS, address_to: ADDRESS })

    expect(rates).toHaveLength(2)
    expect(rates[0].id).toBe(1)
  })

  it("handles direct array format", async () => {
    mockAxios.post.mockResolvedValueOnce({ data: PRINTIFY_SHIPPING_RATES })

    const client = new PrintifyApiClient({ apiKey: "test-key", shopId: "12345" })
    const rates = await client.calculateShipping({ line_items: LINE_ITEMS, address_to: ADDRESS })

    expect(rates).toHaveLength(2)
    expect(rates[1].cost).toBe(999)
  })

  it("throws on invalid response format", async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { invalid: "format" } })

    const client = new PrintifyApiClient({ apiKey: "test-key", shopId: "12345" })

    await expect(
      client.calculateShipping({ line_items: LINE_ITEMS, address_to: ADDRESS }),
    ).rejects.toThrow("Invalid shipping response format from Printify API")
  })

  it("returns cached rates on cache hit without hitting API", async () => {
    // Pre-populate cache
    cache.set(LINE_ITEMS, ADDRESS, PRINTIFY_SHIPPING_RATES)

    const cached = cache.get(LINE_ITEMS, ADDRESS)
    expect(cached).not.toBeNull()
    expect(cached).toHaveLength(2)
    expect(cached![0].name).toBe("Standard Shipping")

    // API should not be called
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it("produces different cache keys for different addresses", () => {
    const address2 = { ...ADDRESS, city: "Seattle", zip: "98101" }

    const key1 = cache.buildKey(LINE_ITEMS, ADDRESS)
    const key2 = cache.buildKey(LINE_ITEMS, address2)

    expect(key1).not.toBe(key2)

    // Store rates for first address
    cache.set(LINE_ITEMS, ADDRESS, PRINTIFY_SHIPPING_RATES)

    // Second address should miss
    const cached = cache.get(LINE_ITEMS, address2)
    expect(cached).toBeNull()
  })
})
