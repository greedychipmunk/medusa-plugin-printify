/**
 * Unit Tests: Storefront API Endpoints
 *
 * Tests for public store API endpoints including product listing,
 * featured products, and product detail routes.
 */

import { GET as listProducts } from "../../../src/api/store/printify/products/route"
import { GET as featuredProducts } from "../../../src/api/store/printify/products/featured/route"
import { GET as productDetail } from "../../../src/api/store/printify/products/[id]/route"

const sampleImages = [
  { src: "https://images.printify.com/mockup-1.jpg", is_default: false },
  { src: "https://images.printify.com/mockup-default.jpg", is_default: true },
  { src: "https://images.printify.com/mockup-3.jpg", is_default: false },
]

const samplePrintifyData = {
  options: [{ name: "Size", type: "size", values: [{ id: 1, title: "S" }, { id: 2, title: "M" }] }],
  variants: [
    { id: 1001, sku: "TSH-S", cost: 800, price: 2500, title: "Small", is_enabled: true, is_available: true, options: [1] },
    { id: 1002, sku: "TSH-M", cost: 800, price: 2500, title: "Medium", is_enabled: true, is_available: true, options: [2] },
  ],
  images: [{ src: "https://images.printify.com/mockup-default.jpg", variant_ids: [1001, 1002], is_default: true }],
}

function makeProduct(overrides: Record<string, any> = {}) {
  return {
    id: "prod-1",
    title: "Test T-Shirt",
    description: "A great shirt",
    enabled: true,
    medusa_product_id: "medusa-prod-1",
    images: sampleImages,
    printify_data: samplePrintifyData,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function buildMockService(overrides: Record<string, any> = {}) {
  return {
    getStorefrontProducts: jest.fn().mockResolvedValue({
      products: [makeProduct()],
      total: 1,
      hasMore: false,
    }),
    getStorefrontProduct: jest.fn().mockResolvedValue(makeProduct()),
    getProductWithMedusaData: jest.fn().mockResolvedValue({
      product: { handle: "test-shirt", thumbnail: "https://medusa.com/thumb.jpg" },
    }),
    ...overrides,
  }
}

function buildReqRes(
  service: any,
  opts: { query?: Record<string, any>; params?: Record<string, any> } = {}
) {
  const req: any = {
    query: opts.query || {},
    params: opts.params || {},
    scope: {
      resolve: jest.fn().mockReturnValue(service),
    },
  }
  const resData: any = {}
  const res: any = {
    json: jest.fn((d: any) => {
      Object.assign(resData, d)
    }),
    status: jest.fn().mockReturnThis(),
  }
  return { req, res, resData }
}

describe("Storefront API Endpoints", () => {
  describe("GET /store/printify/products", () => {
    it("should return preview_image_url from product images", async () => {
      const service = buildMockService()
      const { req, res } = buildReqRes(service)

      await listProducts(req, res)

      const body = res.json.mock.calls[0][0]
      expect(body.data[0].preview_image_url).toBe(
        "https://images.printify.com/mockup-default.jpg"
      )
    })

    it("should return preview_image_url as null when product has no images", async () => {
      const service = buildMockService({
        getStorefrontProducts: jest.fn().mockResolvedValue({
          products: [makeProduct({ images: null })],
          total: 1,
          hasMore: false,
        }),
      })
      const { req, res } = buildReqRes(service)

      await listProducts(req, res)

      const body = res.json.mock.calls[0][0]
      expect(body.data[0].preview_image_url).toBeNull()
    })

    it("should fall back to first image when no default", async () => {
      const imagesNoDefault = [
        { src: "https://images.printify.com/first.jpg", is_default: false },
        { src: "https://images.printify.com/second.jpg", is_default: false },
      ]
      const service = buildMockService({
        getStorefrontProducts: jest.fn().mockResolvedValue({
          products: [makeProduct({ images: imagesNoDefault })],
          total: 1,
          hasMore: false,
        }),
      })
      const { req, res } = buildReqRes(service)

      await listProducts(req, res)

      const body = res.json.mock.calls[0][0]
      expect(body.data[0].preview_image_url).toBe(
        "https://images.printify.com/first.jpg"
      )
    })

    it("should return meta with pagination info", async () => {
      const service = buildMockService()
      const { req, res } = buildReqRes(service, { query: { limit: "10", offset: "0" } })

      await listProducts(req, res)

      const body = res.json.mock.calls[0][0]
      expect(body.meta).toEqual(
        expect.objectContaining({ total: 1, limit: 10, offset: 0, hasMore: false })
      )
    })

    it("should handle server errors gracefully", async () => {
      const service = buildMockService({
        getStorefrontProducts: jest.fn().mockRejectedValue(new Error("DB down")),
      })
      const { req, res } = buildReqRes(service)

      await listProducts(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe("GET /store/printify/products/featured", () => {
    it("should return preview_image_url from product images", async () => {
      const service = buildMockService()
      const { req, res } = buildReqRes(service)

      await featuredProducts(req, res)

      const body = res.json.mock.calls[0][0]
      expect(body.data[0].preview_image_url).toBe(
        "https://images.printify.com/mockup-default.jpg"
      )
    })

    it("should return preview_image_url as null for empty images array", async () => {
      const service = buildMockService({
        getStorefrontProducts: jest.fn().mockResolvedValue({
          products: [makeProduct({ images: [] })],
          total: 1,
          hasMore: false,
        }),
      })
      const { req, res } = buildReqRes(service)

      await featuredProducts(req, res)

      const body = res.json.mock.calls[0][0]
      expect(body.data[0].preview_image_url).toBeNull()
    })

    it("should handle server errors gracefully", async () => {
      const service = buildMockService({
        getStorefrontProducts: jest.fn().mockRejectedValue(new Error("fail")),
      })
      const { req, res } = buildReqRes(service)

      await featuredProducts(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe("GET /store/printify/products/:id", () => {
    it("should return preview_image_url and full images array", async () => {
      const service = buildMockService()
      const { req, res } = buildReqRes(service, { params: { id: "prod-1" } })

      await productDetail(req, res)

      const body = res.json.mock.calls[0][0]
      expect(body.data.preview_image_url).toBe(
        "https://images.printify.com/mockup-default.jpg"
      )
      expect(body.data.images).toEqual(sampleImages)
    })

    it("should return empty images array when product has no images", async () => {
      const service = buildMockService({
        getStorefrontProduct: jest.fn().mockResolvedValue(makeProduct({ images: undefined })),
      })
      const { req, res } = buildReqRes(service, { params: { id: "prod-1" } })

      await productDetail(req, res)

      const body = res.json.mock.calls[0][0]
      expect(body.data.preview_image_url).toBeNull()
      expect(body.data.images).toEqual([])
    })

    it("should prefer is_default image over positional first", async () => {
      const images = [
        { src: "https://images.printify.com/first.jpg", is_default: false },
        { src: "https://images.printify.com/third.jpg", is_default: true },
      ]
      const service = buildMockService({
        getStorefrontProduct: jest.fn().mockResolvedValue(makeProduct({ images })),
      })
      const { req, res } = buildReqRes(service, { params: { id: "prod-1" } })

      await productDetail(req, res)

      const body = res.json.mock.calls[0][0]
      expect(body.data.preview_image_url).toBe("https://images.printify.com/third.jpg")
    })

    it("should return 404 for non-existent product", async () => {
      const service = buildMockService({
        getStorefrontProduct: jest.fn().mockResolvedValue(null),
      })
      const { req, res } = buildReqRes(service, { params: { id: "nonexistent" } })

      await productDetail(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it("should include variants parsed from printify_data", async () => {
      const service = buildMockService()
      const { req, res } = buildReqRes(service, { params: { id: "prod-1" } })

      await productDetail(req, res)

      const body = res.json.mock.calls[0][0]
      expect(body.data.variants).toHaveLength(2)
      expect(body.data.variants[0]).toEqual(
        expect.objectContaining({
          id: 1001,
          sku: "TSH-S",
          price: 2500,
          options: { Size: "S" },
          is_available: true,
        })
      )
    })

    it("should include breadcrumbs in response", async () => {
      const service = buildMockService()
      const { req, res } = buildReqRes(service, { params: { id: "prod-1" } })

      await productDetail(req, res)

      const body = res.json.mock.calls[0][0]
      expect(body.data.breadcrumbs).toHaveLength(3)
      expect(body.data.breadcrumbs[2].name).toBe("Test T-Shirt")
    })

    it("should handle server errors gracefully", async () => {
      const service = buildMockService({
        getStorefrontProduct: jest.fn().mockRejectedValue(new Error("fail")),
      })
      const { req, res } = buildReqRes(service, { params: { id: "prod-1" } })

      await productDetail(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })
})
