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
    printify_data: { raw: true },
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
