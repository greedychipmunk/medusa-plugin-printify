/**
 * Integration Tests: Product Sync Lifecycle
 *
 * Tests product sync from Printify API, enablement/disablement,
 * Medusa product linking, pagination, and storefront filtering.
 * Mocks only the HTTP boundary (axios).
 */

jest.mock("axios", () => ({
  __esModule: true,
  default: { create: jest.fn() },
}))

jest.mock("@medusajs/framework/utils", () => {
  const modelChain = {
    primaryKey: () => modelChain,
    unique: () => modelChain,
    nullable: () => modelChain,
    default: () => modelChain,
  }
  return {
    MedusaService: () => class MockBase {},
    Modules: { PRODUCT: "productService", ORDER: "orderService" },
    ContainerRegistrationKeys: { QUERY: "query" },
    model: {
      define: jest.fn().mockReturnValue({}),
      id: () => modelChain,
      text: () => modelChain,
      number: () => modelChain,
      boolean: () => modelChain,
      json: () => modelChain,
      dateTime: () => modelChain,
    },
    Module: jest.fn(),
    defineConfig: jest.fn(),
  }
})

import { createTestService, TestServiceContext } from "./helpers/test-service-factory"
import {
  setupAxiosMock,
  MockAxiosInstance,
  PRINTIFY_PRODUCTS_SINGLE_PAGE,
  PRINTIFY_PRODUCTS_PAGE_1,
  PRINTIFY_PRODUCTS_PAGE_2,
} from "./helpers/mock-printify-api"

describe("Integration: Product Sync Lifecycle", () => {
  let ctx: TestServiceContext
  let mockAxios: MockAxiosInstance

  beforeEach(() => {
    ctx = createTestService()
    mockAxios = setupAxiosMock()

    // Seed configuration
    ctx.stores.configurations.create([
      {
        id: "config_1",
        store_id: "store_1",
        printify_api_key: "test-key",
        printify_shop_id: "12345",
        sync_enabled: true,
        sync_frequency: 60,
      },
    ])
  })

  it("syncs new products from Printify API", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: PRINTIFY_PRODUCTS_SINGLE_PAGE })

    const result = await ctx.service.syncProducts("config_1")

    expect(result.synced_count).toBe(2)
    expect(result.failed_count).toBe(0)
    expect(result.skipped_count).toBe(0)

    const allProducts = ctx.stores.products.list({})
    expect(allProducts).toHaveLength(2)
    expect(allProducts[0].title).toBe("Classic T-Shirt")
    expect(allProducts[1].title).toBe("Canvas Mug")
    expect(allProducts[0].enabled).toBe(false)
    expect(allProducts[0].printify_product_id).toBe("prod_abc123")
  })

  it("updates stale products on re-sync", async () => {
    // First sync
    mockAxios.get.mockResolvedValueOnce({ data: PRINTIFY_PRODUCTS_SINGLE_PAGE })
    await ctx.service.syncProducts("config_1")

    // Mark products as stale (old last_sync_at)
    const products = ctx.stores.products.list({})
    for (const p of products) {
      ctx.stores.products.update([
        { id: p.id, last_sync_at: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      ])
    }

    // Second sync with updated title
    const updatedPage = {
      ...PRINTIFY_PRODUCTS_SINGLE_PAGE,
      data: PRINTIFY_PRODUCTS_SINGLE_PAGE.data.map((p) => ({
        ...p,
        title: p.title + " V2",
      })),
    }
    mockAxios.get.mockResolvedValueOnce({ data: updatedPage })
    const result = await ctx.service.syncProducts("config_1")

    expect(result.synced_count).toBe(2)
    expect(result.skipped_count).toBe(0)

    const updated = ctx.stores.products.list({})
    expect(updated[0].title).toBe("Classic T-Shirt V2")
    expect(updated).toHaveLength(2) // no duplicates
  })

  it("skips fresh products within max_age", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: PRINTIFY_PRODUCTS_SINGLE_PAGE })
    await ctx.service.syncProducts("config_1")

    // Products have fresh last_sync_at from first sync
    mockAxios.get.mockResolvedValueOnce({ data: PRINTIFY_PRODUCTS_SINGLE_PAGE })
    const result = await ctx.service.syncProducts("config_1", { max_age_minutes: 60 })

    expect(result.skipped_count).toBe(2)
    expect(result.synced_count).toBe(0)
  })

  it("force sync overrides freshness check", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: PRINTIFY_PRODUCTS_SINGLE_PAGE })
    await ctx.service.syncProducts("config_1")

    mockAxios.get.mockResolvedValueOnce({ data: PRINTIFY_PRODUCTS_SINGLE_PAGE })
    const result = await ctx.service.syncProducts("config_1", { force: true })

    expect(result.synced_count).toBe(2)
    expect(result.skipped_count).toBe(0)
  })

  it("handles pagination across multiple pages", async () => {
    mockAxios.get
      .mockResolvedValueOnce({ data: PRINTIFY_PRODUCTS_PAGE_1 })
      .mockResolvedValueOnce({ data: PRINTIFY_PRODUCTS_PAGE_2 })

    const result = await ctx.service.syncProducts("config_1")

    expect(result.synced_count).toBe(3)
    expect(ctx.stores.products.list({})).toHaveLength(3)
    expect(mockAxios.get).toHaveBeenCalledTimes(2)
  })

  it("enable creates Medusa product and link", async () => {
    ctx.stores.products.create([
      {
        id: "pprod_1",
        printify_product_id: "prod_abc123",
        configuration_id: "config_1",
        title: "Classic T-Shirt",
        description: "A cotton tee",
        enabled: false,
        tags: ["apparel"],
        images: [{ src: "test.jpg" }],
      },
    ])

    await ctx.service.enableProduct("pprod_1", "admin", "Manual enable")

    const updated = ctx.stores.products.retrieve("pprod_1")
    expect(updated.enabled).toBe(true)

    // Should have created a Medusa product
    expect(ctx.mockContainer.productService.createProducts).toHaveBeenCalledTimes(1)
    // Should have created a link
    expect(ctx.mockContainer.link.create).toHaveBeenCalledTimes(1)
  })

  it("disable removes Medusa product and link", async () => {
    ctx.stores.products.create([
      {
        id: "pprod_2",
        printify_product_id: "prod_def456",
        configuration_id: "config_1",
        title: "Canvas Mug",
        enabled: true,
        medusa_product_id: "medusa_prod_99",
      },
    ])

    await ctx.service.disableProduct("pprod_2", "admin", "Manual disable")

    const updated = ctx.stores.products.retrieve("pprod_2")
    expect(updated.enabled).toBe(false)

    // Should have attempted to retrieve and delete the Medusa product
    expect(ctx.mockContainer.productService.retrieveProduct).toHaveBeenCalledWith("medusa_prod_99")
    expect(ctx.mockContainer.productService.deleteProducts).toHaveBeenCalledWith(["medusa_prod_99"])
    // Should have dismissed the link
    expect(ctx.mockContainer.link.dismiss).toHaveBeenCalledTimes(1)
  })

  it("enable skips Medusa product creation if already linked", async () => {
    ctx.stores.products.create([
      {
        id: "pprod_3",
        printify_product_id: "prod_ghi789",
        configuration_id: "config_1",
        title: "Tote Bag",
        enabled: false,
        medusa_product_id: "existing_medusa_id",
      },
    ])

    await ctx.service.enableProduct("pprod_3", "admin")

    const updated = ctx.stores.products.retrieve("pprod_3")
    expect(updated.enabled).toBe(true)

    // Should NOT create a new product since medusa_product_id already exists
    expect(ctx.mockContainer.productService.createProducts).not.toHaveBeenCalled()
  })

  it("storefront returns only enabled products", async () => {
    ctx.stores.products.create([
      { id: "sf_1", title: "Enabled Tee", enabled: true, configuration_id: "config_1" },
      { id: "sf_2", title: "Disabled Mug", enabled: false, configuration_id: "config_1" },
    ])

    const result = await ctx.service.getStorefrontProducts()

    expect(result.products).toHaveLength(1)
    expect(result.products[0].title).toBe("Enabled Tee")
    expect(result.total).toBe(1)
  })

  it("product stats aggregation counts enabled/disabled correctly", async () => {
    ctx.stores.products.create([
      { id: "ps_1", enabled: true, configuration_id: "config_1", medusa_product_id: "mp_1" },
      { id: "ps_2", enabled: true, configuration_id: "config_1", medusa_product_id: null },
      { id: "ps_3", enabled: false, configuration_id: "config_1", medusa_product_id: null },
      { id: "ps_4", enabled: false, configuration_id: "config_1", medusa_product_id: null },
    ])

    const result = await ctx.service.getProductsByConfiguration("config_1")

    expect(result.total).toBe(4)
    expect(result.products.filter((p: any) => p.enabled)).toHaveLength(2)
    expect(result.products.filter((p: any) => !p.enabled)).toHaveLength(2)
    expect(result.products.filter((p: any) => p.medusa_product_id)).toHaveLength(1)
  })
})
