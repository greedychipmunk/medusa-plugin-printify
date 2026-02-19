/**
 * Integration Tests: Variant Availability
 *
 * Tests the full variant availability flow: product lookup → API call → parse → cache.
 * Mocks only the HTTP boundary (axios) and MedusaService base class.
 */

jest.mock("axios", () => ({
  __esModule: true,
  default: { create: jest.fn() },
}))

import { createTestService, TestServiceContext } from "./helpers/test-service-factory"
import { setupAxiosMock, MockAxiosInstance, PRINTIFY_PRODUCT_1 } from "./helpers/mock-printify-api"
import { VariantAvailabilityCache } from "../../src/modules/printify/utils/variant-availability-cache"

// Clear the singleton cache between tests
import { variantAvailabilityCache } from "../../src/modules/printify/utils/variant-availability-cache"

describe("Integration: Variant Availability", () => {
  let ctx: TestServiceContext
  let mockAxios: MockAxiosInstance
  let configId: string
  let productId: string

  beforeEach(() => {
    ctx = createTestService()
    mockAxios = setupAxiosMock()
    variantAvailabilityCache.clear()

    // Seed a configuration
    const [config] = ctx.stores.configurations.create([{
      store_id: "store-1",
      printify_api_key: "test-key",
      printify_shop_id: "12345",
      sync_enabled: true,
      sync_frequency: 60,
    }])
    configId = config.id

    // Seed a product with printify_data
    const [product] = ctx.stores.products.create([{
      printify_product_id: PRINTIFY_PRODUCT_1.id,
      configuration_id: configId,
      title: PRINTIFY_PRODUCT_1.title,
      description: PRINTIFY_PRODUCT_1.description,
      enabled: true,
      blueprint_id: "5",
      print_provider_id: "0",
      tags: PRINTIFY_PRODUCT_1.tags,
      images: PRINTIFY_PRODUCT_1.images,
      printify_data: PRINTIFY_PRODUCT_1,
      last_sync_at: new Date(),
    }])
    productId = product.id
  })

  afterEach(() => {
    variantAvailabilityCache.clear()
  })

  it("fetches live variant data from Printify API on cache miss", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: PRINTIFY_PRODUCT_1 })

    const result = await ctx.service.getVariantAvailability(productId)

    expect(result.cached).toBe(false)
    expect(result.variants).toHaveLength(2)
    expect(result.variants[0]).toEqual(
      expect.objectContaining({
        id: 1001,
        sku: "TSH-S",
        price: 2500,
        is_available: true,
        options: { Size: "S" },
      })
    )
    expect(result.variants[1]).toEqual(
      expect.objectContaining({
        id: 1002,
        sku: "TSH-M",
        options: { Size: "M" },
      })
    )
  })

  it("returns cached data on second call within TTL", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: PRINTIFY_PRODUCT_1 })

    // First call — cache miss
    const first = await ctx.service.getVariantAvailability(productId)
    expect(first.cached).toBe(false)

    // Second call — cache hit (no additional API call)
    const second = await ctx.service.getVariantAvailability(productId)
    expect(second.cached).toBe(true)
    expect(second.variants).toHaveLength(2)

    // Only one API call made
    expect(mockAxios.get).toHaveBeenCalledTimes(1)
  })

  it("filters variants by variant_ids", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: PRINTIFY_PRODUCT_1 })

    const result = await ctx.service.getVariantAvailability(productId, ["1001"])

    expect(result.variants).toHaveLength(1)
    expect(result.variants[0].id).toBe(1001)
  })

  it("throws for disabled product", async () => {
    // Disable the product
    ctx.stores.products.update([{ id: productId, enabled: false }])

    await expect(ctx.service.getVariantAvailability(productId)).rejects.toThrow(
      "Product not found or not enabled"
    )
  })

  it("throws for non-existent product", async () => {
    await expect(ctx.service.getVariantAvailability("nonexistent")).rejects.toThrow()
  })
})
