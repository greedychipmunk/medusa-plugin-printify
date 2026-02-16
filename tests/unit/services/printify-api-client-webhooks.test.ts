/**
 * Unit Tests: PrintifyApiClient Webhook Methods
 *
 * Tests for listWebhooks, createWebhook, and deleteWebhook methods.
 */

import { PrintifyApiClient } from "../../../src/modules/printify/services/printify-api-client"

// We'll mock the internal axios instance via the private property
// Since resetMocks: true is on, we create fresh instances in beforeEach

const mockGet = jest.fn()
const mockPost = jest.fn()
const mockDelete = jest.fn()

// Override axios.create to return our mock instance
jest.mock("axios", () => {
  return {
    __esModule: true,
    default: {
      create: jest.fn(),
    },
  }
})

import axios from "axios"

describe("PrintifyApiClient - Webhook Methods", () => {
  let client: PrintifyApiClient

  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockDelete.mockReset()

    // Re-set the mock implementation since resetMocks clears it
    ;(axios.create as jest.Mock).mockReturnValue({
      get: mockGet,
      post: mockPost,
      put: jest.fn(),
      delete: mockDelete,
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

  // 1. listWebhooks returns array of webhooks
  it("should list webhooks from the correct endpoint", async () => {
    const mockWebhooks = [
      { id: "wh-1", topic: "order:shipped", url: "https://example.com/webhook", shop_id: "shop-123", secret: "s1" },
      { id: "wh-2", topic: "product:updated", url: "https://example.com/webhook", shop_id: "shop-123", secret: "s2" },
    ]
    mockGet.mockResolvedValue({ data: mockWebhooks })

    const result = await client.listWebhooks()

    expect(mockGet).toHaveBeenCalledWith("/shops/shop-123/webhooks.json")
    expect(result).toEqual(mockWebhooks)
    expect(result).toHaveLength(2)
  })

  // 2. createWebhook sends correct payload
  it("should create webhook with topic and url", async () => {
    const mockWebhook = { id: "wh-new", topic: "order:shipped", url: "https://example.com/hook", shop_id: "shop-123", secret: "" }
    mockPost.mockResolvedValue({ data: mockWebhook })

    const result = await client.createWebhook("order:shipped", "https://example.com/hook")

    expect(mockPost).toHaveBeenCalledWith(
      "/shops/shop-123/webhooks.json",
      { topic: "order:shipped", url: "https://example.com/hook" },
    )
    expect(result).toEqual(mockWebhook)
  })

  // 3. createWebhook includes secret when provided
  it("should include secret in webhook creation payload", async () => {
    const mockWebhook = { id: "wh-new", topic: "order:shipped", url: "https://example.com/hook", shop_id: "shop-123", secret: "my-secret" }
    mockPost.mockResolvedValue({ data: mockWebhook })

    const result = await client.createWebhook("order:shipped", "https://example.com/hook", "my-secret")

    expect(mockPost).toHaveBeenCalledWith(
      "/shops/shop-123/webhooks.json",
      { topic: "order:shipped", url: "https://example.com/hook", secret: "my-secret" },
    )
    expect(result.secret).toBe("my-secret")
  })

  // 4. deleteWebhook calls correct endpoint
  it("should delete webhook by ID", async () => {
    mockDelete.mockResolvedValue({ data: {} })

    await client.deleteWebhook("wh-123")

    expect(mockDelete).toHaveBeenCalledWith("/shops/shop-123/webhooks/wh-123.json")
  })

  // 5. Handles API errors gracefully
  it("should propagate API errors from webhook operations", async () => {
    const apiError = new Error("Not Found")
    mockDelete.mockRejectedValue(apiError)

    await expect(client.deleteWebhook("nonexistent")).rejects.toThrow("Not Found")
  })
})
