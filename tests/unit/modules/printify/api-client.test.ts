import axios from "axios"
import { PrintifyApiClient } from "../../../../src/modules/printify/api-client"

jest.mock("axios", () => ({
  __esModule: true,
  default: { create: jest.fn() },
}))

let mockGet: jest.Mock
let mockPost: jest.Mock
let mockPut: jest.Mock
let mockDelete: jest.Mock
let mockAxiosInstance: {
  get: jest.Mock
  post: jest.Mock
  put: jest.Mock
  delete: jest.Mock
  interceptors: { response: { use: jest.Mock } }
}

beforeEach(() => {
  mockGet = jest.fn()
  mockPost = jest.fn()
  mockPut = jest.fn()
  mockDelete = jest.fn()

  let capturedErrorHandler: ((error: unknown) => Promise<unknown>) | undefined

  const responseUse = jest.fn().mockImplementation(
    (_onFulfilled: unknown, onRejected: (error: unknown) => Promise<unknown>) => {
      capturedErrorHandler = onRejected
    }
  )

  mockAxiosInstance = {
    get: jest.fn((...args: unknown[]) =>
      mockGet(...args).catch((err: unknown) =>
        capturedErrorHandler ? capturedErrorHandler(err) : Promise.reject(err)
      )
    ),
    post: jest.fn((...args: unknown[]) =>
      mockPost(...args).catch((err: unknown) =>
        capturedErrorHandler ? capturedErrorHandler(err) : Promise.reject(err)
      )
    ),
    put: jest.fn((...args: unknown[]) =>
      mockPut(...args).catch((err: unknown) =>
        capturedErrorHandler ? capturedErrorHandler(err) : Promise.reject(err)
      )
    ),
    delete: jest.fn((...args: unknown[]) =>
      mockDelete(...args).catch((err: unknown) =>
        capturedErrorHandler ? capturedErrorHandler(err) : Promise.reject(err)
      )
    ),
    interceptors: {
      response: { use: responseUse },
    },
  }

  ;(axios.create as jest.Mock).mockReturnValue(mockAxiosInstance)
})

describe("PrintifyApiClient", () => {
  it("creates axios instance with correct base config", () => {
    new PrintifyApiClient("test-api-key")
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: "https://api.printify.com/v1",
      headers: {
        Authorization: "Bearer test-api-key",
        "Content-Type": "application/json",
      },
    })
  })

  it("getShops returns shops array", async () => {
    const client = new PrintifyApiClient("key")
    mockGet.mockResolvedValue({ data: [{ id: "123", title: "My Shop" }] })
    const result = await client.getShops()
    expect(mockGet).toHaveBeenCalledWith("/shops.json")
    expect(result).toEqual([{ id: "123", title: "My Shop" }])
  })

  it("wraps Printify API errors with status and detail", async () => {
    const client = new PrintifyApiClient("key")
    mockGet.mockRejectedValue({
      response: { status: 422, data: { errors: { address1: ["is required"] } } },
    })
    await expect(client.getShops()).rejects.toThrow("Printify API error 422")
  })

  it("getProducts passes page and limit params", async () => {
    const client = new PrintifyApiClient("key")
    const mockResponse = { data: [], current_page: 2, last_page: 3 }
    mockGet.mockResolvedValue({ data: mockResponse })
    const result = await client.getProducts("shop1", 2, 50)
    expect(mockGet).toHaveBeenCalledWith("/shops/shop1/products.json", {
      params: { page: 2, limit: 50 },
    })
    expect(result).toEqual(mockResponse)
  })

  it("getProduct fetches single product", async () => {
    const client = new PrintifyApiClient("key")
    mockGet.mockResolvedValue({ data: { id: "p1", title: "Test" } })
    const result = await client.getProduct("shop1", "p1")
    expect(mockGet).toHaveBeenCalledWith("/shops/shop1/products/p1.json")
    expect(result.id).toBe("p1")
  })

  it("createOrder posts payload to correct endpoint", async () => {
    const client = new PrintifyApiClient("key")
    const payload = {
      external_id: "order-123",
      label: "Order #123",
      line_items: [{ product_id: "p1", variant_id: 1, quantity: 1 }],
      shipping_method: 1,
      send_shipping_notification: false,
      address_to: {
        first_name: "Jane", last_name: "Doe", email: "j@e.com",
        phone: "555-0100", country: "US", region: "CA",
        address1: "1 Main St", city: "SF", zip: "94105",
      },
    }
    mockPost.mockResolvedValue({ data: { id: "po1", status: "pending" } })
    const result = await client.createOrder("shop1", payload)
    expect(mockPost).toHaveBeenCalledWith("/shops/shop1/orders.json", payload)
    expect(result.id).toBe("po1")
  })

  it("submitOrder posts to send_to_production endpoint", async () => {
    const client = new PrintifyApiClient("key")
    mockPost.mockResolvedValue({ data: { id: "po1", status: "in-production" } })
    const result = await client.submitOrder("shop1", "po1")
    expect(mockPost).toHaveBeenCalledWith("/shops/shop1/orders/po1/send_to_production.json")
    expect(result.status).toBe("in-production")
  })

  it("getOrder fetches order by id", async () => {
    const client = new PrintifyApiClient("key")
    mockGet.mockResolvedValue({ data: { id: "po1", status: "shipped" } })
    const result = await client.getOrder("shop1", "po1")
    expect(mockGet).toHaveBeenCalledWith("/shops/shop1/orders/po1.json")
    expect(result.status).toBe("shipped")
  })

  it("createWebhook registers a topic", async () => {
    const client = new PrintifyApiClient("key")
    const webhook = { id: "wh1", topic: "order:shipped", url: "https://store.com/webhooks/printify", shop_id: "shop1", secret: "s" }
    mockPost.mockResolvedValue({ data: webhook })
    const result = await client.createWebhook("shop1", "order:shipped", "https://store.com/webhooks/printify")
    expect(mockPost).toHaveBeenCalledWith("/shops/shop1/webhooks.json", {
      topic: "order:shipped",
      url: "https://store.com/webhooks/printify",
    })
    expect(result.topic).toBe("order:shipped")
  })

  it("deleteWebhook calls delete endpoint", async () => {
    const client = new PrintifyApiClient("key")
    mockDelete.mockResolvedValue({ data: {} })
    await client.deleteWebhook("shop1", "wh1")
    expect(mockDelete).toHaveBeenCalledWith("/shops/shop1/webhooks/wh1.json")
  })
})
