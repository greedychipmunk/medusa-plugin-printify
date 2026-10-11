import { PATCH } from "../../../src/api/admin/printify/products/[id]/route"

const publishedRaw = {
  visible: true, is_locked: false,
  external: { id: "medusa_01", handle: "https://store.test/products/test-tee" },
}

describe("PATCH /admin/printify/products/[id]", () => {
  const existing = {
    id: "prod_01", printify_id: "abc123", shop_id: "shop1",
    is_published: true, is_locked: false, visibility_override: true, printify_data: publishedRaw,
  }
  let service: Record<string, jest.Mock>
  let remote: { getProduct: jest.Mock }
  let query: { graph: jest.Mock }
  let products: { updateProducts: jest.Mock }
  let link: { create: jest.Mock }
  let store: { listStores: jest.Mock }
  let logger: { error: jest.Mock }

  beforeEach(() => {
    remote = { getProduct: jest.fn().mockResolvedValue(publishedRaw) }
    service = {
      retrievePrintifyProduct: jest.fn().mockResolvedValue(existing),
      getApiClient: jest.fn().mockReturnValue(remote),
      updatePrintifyProducts: jest.fn().mockImplementation(({ data }) => Promise.resolve([{ ...existing, ...data }])),
      listPrintifyShops: jest.fn().mockResolvedValue([{ sales_channel_id: "sc_shop" }]),
    }
    query = { graph: jest.fn().mockResolvedValue({ data: [{ product: { id: "medusa_01", sales_channels: [] } }] }) }
    products = { updateProducts: jest.fn().mockResolvedValue({}) }
    link = { create: jest.fn().mockResolvedValue({}) }
    store = { listStores: jest.fn().mockResolvedValue([{ default_sales_channel_id: "sc_default" }]) }
    logger = { error: jest.fn() }
  })

  const request = (body: unknown) => ({
    params: { id: "prod_01" }, body,
    scope: { resolve: jest.fn((key: string) => ({
      printify: service, query, product: products, link, store, logger,
    })[key]) },
  })
  const response = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() })

  it.each([null, {}, { is_published: "true" }, { is_published: 1 }])("rejects invalid body %p", async body => {
    const res = response()
    await PATCH(request(body) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.retrievePrintifyProduct).not.toHaveBeenCalled()
  })

  it("returns 404 when the product does not exist", async () => {
    service.retrievePrintifyProduct.mockRejectedValue(new Error("not found"))
    const res = response()
    await PATCH(request({ is_published: true }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(remote.getProduct).not.toHaveBeenCalled()
  })

  it.each([
    { ...publishedRaw, visible: false },
    { ...publishedRaw, is_locked: true },
    { ...publishedRaw, visible: false, is_locked: true },
    { ...publishedRaw, visible: "true" },
    { ...publishedRaw, is_locked: "false" },
    { visible: true, external: publishedRaw.external },
    { is_locked: false, external: publishedRaw.external },
    // Printify defaults visible to true, even before first publication.
    { visible: true, is_locked: false },
    { ...publishedRaw, external: null },
    { ...publishedRaw, external: {} },
    { ...publishedRaw, external: { id: "", handle: publishedRaw.external.handle } },
    { ...publishedRaw, external: { id: "  ", handle: publishedRaw.external.handle } },
    { ...publishedRaw, external: { id: "medusa_01", handle: "" } },
    { ...publishedRaw, external: { id: "medusa_01", handle: "  " } },
    { ...publishedRaw, external: { id: 123, handle: publishedRaw.external.handle } },
    { ...publishedRaw, external: { id: "medusa_01", handle: true } },
    { ...publishedRaw, external: "not-an-object" },
    { ...publishedRaw, external: [] },
    {},
    null,
  ])("cannot force-show upstream flags %p, even with a legacy true override", async flags => {
    remote.getProduct.mockResolvedValue(flags)
    const res = response()
    await PATCH(request({ is_published: true }) as any, res as any)
    expect(remote.getProduct).toHaveBeenCalledWith("shop1", "abc123")
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("Publish in Printify first") }))
    expect(service.updatePrintifyProducts).toHaveBeenCalledWith({
      selector: { id: "prod_01" },
      data: { is_published: false, is_locked: flags?.is_locked !== false, printify_data: flags },
    })
    expect(products.updateProducts).toHaveBeenCalledWith("medusa_01", { status: "draft" })
    expect(link.create).not.toHaveBeenCalled()
    expect(service.listPrintifyShops).not.toHaveBeenCalled()
  })

  it.each([[], "malformed-record", false])("fails closed on malformed upstream records %p", async raw => {
    remote.getProduct.mockResolvedValue(raw)
    const res = response()
    await PATCH(request({ is_published: true }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(service.updatePrintifyProducts).toHaveBeenCalledWith({
      selector: { id: "prod_01" },
      data: { is_published: false, is_locked: true, printify_data: null },
    })
    expect(products.updateProducts).toHaveBeenCalledWith("medusa_01", { status: "draft" })
    expect(link.create).not.toHaveBeenCalled()
  })

  it("does not erase a local hide preference on a rejected show", async () => {
    service.retrievePrintifyProduct.mockResolvedValue({ ...existing, visibility_override: false })
    remote.getProduct.mockResolvedValue({ visible: false, is_locked: false })
    const res = response()
    await PATCH(request({ is_published: true }) as any, res as any)
    expect(service.updatePrintifyProducts.mock.calls[0][0].data).not.toHaveProperty("visibility_override")
    expect(res.status).toHaveBeenCalledWith(409)
  })

  it.each(["read", "client"])("returns 503 on upstream %s failure without publishing or persisting intent", async stage => {
    if (stage === "read") remote.getProduct.mockRejectedValue(new Error("offline"))
    else service.getApiClient.mockImplementation(() => { throw new Error("not configured") })
    const res = response()
    await PATCH(request({ is_published: true }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(service.updatePrintifyProducts).not.toHaveBeenCalled()
    expect(products.updateProducts).not.toHaveBeenCalled()
    expect(link.create).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('"stage":"verify_upstream"'))
  })

  it("hides locally without contacting Printify or overwriting canonical publication", async () => {
    service.getApiClient.mockImplementation(() => { throw new Error("offline") })
    const res = response()
    await PATCH(request({ is_published: false }) as any, res as any)
    expect(service.getApiClient).not.toHaveBeenCalled()
    expect(remote.getProduct).not.toHaveBeenCalled()
    expect(service.updatePrintifyProducts).toHaveBeenCalledWith({
      selector: { id: "prod_01" }, data: { visibility_override: false },
    })
    expect(products.updateProducts).toHaveBeenCalledWith("medusa_01", { status: "draft" })
    expect(res.json).toHaveBeenCalledWith({ product: { ...existing, visibility_override: false } })
    expect(link.create).not.toHaveBeenCalled()
  })

  it("shows only after upstream verification and links the shop sales channel", async () => {
    service.retrievePrintifyProduct.mockResolvedValue({
      ...existing, is_published: false, is_locked: true, visibility_override: false,
      printify_data: { visible: true, is_locked: true, external: null },
    })
    const res = response()
    await PATCH(request({ is_published: true }) as any, res as any)
    expect(service.updatePrintifyProducts).toHaveBeenCalledWith({
      selector: { id: "prod_01" }, data: {
        is_published: true, is_locked: false, visibility_override: true, printify_data: publishedRaw,
      },
    })
    expect(products.updateProducts).toHaveBeenCalledWith("medusa_01", { status: "published" })
    expect(link.create).toHaveBeenCalledWith({ product: { product_id: "medusa_01" }, sales_channel: { sales_channel_id: "sc_shop" } })
    expect(store.listStores).not.toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it("falls back to the store default sales channel", async () => {
    service.listPrintifyShops.mockResolvedValue([])
    const res = response()
    await PATCH(request({ is_published: true }) as any, res as any)
    expect(link.create).toHaveBeenCalledWith({ product: { product_id: "medusa_01" }, sales_channel: { sales_channel_id: "sc_default" } })
  })

  it("does not recreate an existing sales channel link", async () => {
    query.graph.mockResolvedValue({ data: [{ product: { id: "medusa_01", sales_channels: [{ id: "sc_shop" }] } }] })
    const res = response()
    await PATCH(request({ is_published: true }) as any, res as any)
    expect(link.create).not.toHaveBeenCalled()
    expect(products.updateProducts).toHaveBeenCalledWith("medusa_01", { status: "published" })
    expect(res.status).not.toHaveBeenCalled()
  })

  it("updates local visibility when no Medusa link exists", async () => {
    query.graph.mockResolvedValue({ data: [] })
    const res = response()
    await PATCH(request({ is_published: false }) as any, res as any)
    expect(service.updatePrintifyProducts).toHaveBeenCalled()
    expect(products.updateProducts).not.toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it.each([true, false])("returns 500 rather than false success on DB failure (show=%p)", async show => {
    service.updatePrintifyProducts.mockRejectedValue(new Error("DB unavailable"))
    const res = response()
    await PATCH(request({ is_published: show }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("Failed to save") }))
    expect(products.updateProducts).not.toHaveBeenCalledWith("medusa_01", { status: "published" })
  })

  it("drafts a leaked linked product even when persisting canonical repairs fails", async () => {
    remote.getProduct.mockResolvedValue({ visible: false, is_locked: false })
    service.updatePrintifyProducts.mockRejectedValue(new Error("DB unavailable"))
    const res = response()
    await PATCH(request({ is_published: true }) as any, res as any)
    expect(products.updateProducts).toHaveBeenCalledWith("medusa_01", { status: "draft" })
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it.each([true, false])("returns 500 on linked status update failure (show=%p)", async show => {
    products.updateProducts.mockRejectedValue(new Error("status failed"))
    const res = response()
    await PATCH(request({ is_published: show }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("Failed to update linked") }))
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('"stage":"update_linked_product"'))
  })

  it("does not falsely return 409 when drafting a leaked product failed", async () => {
    remote.getProduct.mockResolvedValue({ visible: true, is_locked: true })
    products.updateProducts.mockRejectedValue(new Error("status failed"))
    const res = response()
    await PATCH(request({ is_published: true }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it.each(["graph", "channel"])("reports %s failures instead of claiming success", async stage => {
    if (stage === "graph") query.graph.mockRejectedValue(new Error("query failed"))
    else link.create.mockRejectedValue(new Error("link failed"))
    const res = response()
    await PATCH(request({ is_published: true }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(products.updateProducts).not.toHaveBeenCalledWith("medusa_01", { status: "published" })
  })
})

describe("GET /admin/printify/products/[id]", () => {
  const mockProduct = {
    id: "prod_01",
    printify_id: "abc123",
    shop_id: "shop1",
    title: "Test Tee",
    description: "A tee",
    variants: [
      { id: 1, title: "S", sku: "SKU-S", cost: 500, price: 1200, is_enabled: true },
    ],
    images: [{ src: "https://img.test/1.png", position: "front", is_default: true }],
    print_areas: [],
    is_published: true,
    is_locked: false,
    printify_data: publishedRaw,
  }

  let mockService: Record<string, jest.Mock>
  let mockQuery: { graph: jest.Mock }

  beforeEach(() => {
    mockService = {
      retrievePrintifyProduct: jest.fn().mockResolvedValue(mockProduct),
    }
    mockQuery = {
      graph: jest.fn().mockResolvedValue({ data: [] }),
    }
  })

  it("returns product with linked medusa product id", async () => {
    mockQuery.graph.mockResolvedValue({
      data: [{ product: { id: "medusa_prod_01" } }],
    })

    const req = {
      params: { id: "prod_01" },
      scope: {
        resolve: jest.fn((key: string) => {
          if (key === "printify") return mockService
          if (key === "query") return mockQuery
          return undefined
        }),
      },
    }
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() }

    const { GET } = await import(
      "../../../src/api/admin/printify/products/[id]/route.js"
    )
    await GET(req as any, res as any)

    expect(mockService.retrievePrintifyProduct).toHaveBeenCalledWith("prod_01")
    expect(mockQuery.graph).toHaveBeenCalledWith({
      entity: "printify_product",
      fields: ["product.id"],
      filters: { id: "prod_01" },
    })
    expect(res.json).toHaveBeenCalledWith({
      product: mockProduct,
      medusa_product_id: "medusa_prod_01",
    })
  })

  it("returns null medusa_product_id when no link exists", async () => {
    mockQuery.graph.mockResolvedValue({ data: [] })

    const req = {
      params: { id: "prod_01" },
      scope: {
        resolve: jest.fn((key: string) => {
          if (key === "printify") return mockService
          if (key === "query") return mockQuery
          return undefined
        }),
      },
    }
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() }

    const { GET } = await import(
      "../../../src/api/admin/printify/products/[id]/route.js"
    )
    await GET(req as any, res as any)

    expect(res.json).toHaveBeenCalledWith({
      product: mockProduct,
      medusa_product_id: null,
    })
  })

  it("returns null medusa_product_id when query.graph throws", async () => {
    mockQuery.graph.mockRejectedValue(new Error("Link not configured"))

    const req = {
      params: { id: "prod_01" },
      scope: {
        resolve: jest.fn((key: string) => {
          if (key === "printify") return mockService
          if (key === "query") return mockQuery
          return undefined
        }),
      },
    }
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() }

    const { GET } = await import(
      "../../../src/api/admin/printify/products/[id]/route.js"
    )
    await GET(req as any, res as any)

    expect(res.json).toHaveBeenCalledWith({
      product: mockProduct,
      medusa_product_id: null,
    })
  })
})
