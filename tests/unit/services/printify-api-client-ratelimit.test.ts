/**
 * Unit Tests: PrintifyApiClient Rate Limit Interceptor
 *
 * Tests for automatic 429 retry, rate limit header tracking, and error passthrough.
 */

import { PrintifyApiClient } from "../../../src/modules/printify/services/printify-api-client"

// Capture the response interceptor handlers so we can invoke them directly
let responseSuccessHandler: (response: any) => any
let responseErrorHandler: (error: any) => any

const mockGet = jest.fn()
const mockPost = jest.fn()
const mockRequest = jest.fn()

jest.mock("axios", () => {
  return {
    __esModule: true,
    default: {
      create: jest.fn(),
    },
  }
})

import axios from "axios"

describe("PrintifyApiClient - Rate Limit Interceptor", () => {
  let client: PrintifyApiClient
  let mockLogger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock }

  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockRequest.mockReset()
    responseSuccessHandler = undefined as any
    responseErrorHandler = undefined as any

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }

    ;(axios.create as jest.Mock).mockReturnValue({
      get: mockGet,
      post: mockPost,
      put: jest.fn(),
      delete: jest.fn(),
      request: mockRequest,
      interceptors: {
        request: { use: jest.fn() },
        response: {
          use: jest.fn((onSuccess: any, onError: any) => {
            responseSuccessHandler = onSuccess
            responseErrorHandler = onError
          }),
        },
      },
    })

    client = new PrintifyApiClient({
      apiKey: "test-key",
      shopId: "shop-123",
      logger: mockLogger,
    })
  })

  // 1. Success response updates rate limit state
  it("should update rate limit info from success response headers", () => {
    const response = {
      status: 200,
      headers: {
        "x-ratelimit-limit": "100",
        "x-ratelimit-remaining": "57",
        "x-ratelimit-reset": "1700000000",
      },
      config: { url: "/shops/shop-123/products.json" },
      data: {},
    }

    responseSuccessHandler(response)

    const info = client.getRateLimitInfo()
    expect(info.limit).toBe(100)
    expect(info.remaining).toBe(57)
    expect(info.resetAt).toBe(1700000000000)
  })

  // 2. getRateLimitInfo returns undefined before any responses
  it("should return undefined rate limit info initially", () => {
    const info = client.getRateLimitInfo()
    expect(info.limit).toBeUndefined()
    expect(info.remaining).toBeUndefined()
    expect(info.resetAt).toBeUndefined()
  })

  // 3. 429 triggers automatic retry
  it("should retry on 429 response", async () => {
    // Use fake timers to avoid waiting for real delays
    jest.useFakeTimers()

    const error429 = {
      response: {
        status: 429,
        headers: { "retry-after": "1" },
      },
      config: { method: "get", url: "/shops/shop-123/products.json" },
    }

    mockRequest.mockResolvedValue({ data: { id: "prod-1" }, status: 200 })

    const retryPromise = responseErrorHandler(error429)

    // Advance past the 1-second Retry-After delay
    jest.advanceTimersByTime(1500)

    const result = await retryPromise
    expect(result).toEqual({ data: { id: "prod-1" }, status: 200 })
    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Rate limited (429)"))

    jest.useRealTimers()
  })

  // 4. 429 retry respects Retry-After header
  it("should use Retry-After header for retry delay", async () => {
    jest.useFakeTimers()

    const error429 = {
      response: { status: 429, headers: { "retry-after": "3" } },
      config: { method: "get", url: "/test" },
    }

    mockRequest.mockResolvedValue({ data: {}, status: 200 })

    const retryPromise = responseErrorHandler(error429)

    // 2 seconds should not be enough
    jest.advanceTimersByTime(2000)
    // But 3+ seconds should resolve it
    jest.advanceTimersByTime(1500)

    await retryPromise
    expect(mockRequest).toHaveBeenCalled()

    jest.useRealTimers()
  })

  // 5. Gives up after max retries
  it("should reject after max retries exhausted", async () => {
    const error429 = {
      response: { status: 429, headers: {} },
      config: { method: "get", url: "/test", __retryCount: 3 },
    }

    await expect(responseErrorHandler(error429)).rejects.toEqual(
      expect.objectContaining({ status: 429 }),
    )
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Rate limit exceeded after 3 retries"),
    )
  })

  // 6. Non-429 errors pass through unchanged
  it("should not retry non-429 errors", async () => {
    const error500 = {
      response: {
        status: 500,
        data: { error: "Internal Server Error", message: "Something broke" },
      },
      config: { method: "get", url: "/test" },
    }

    await expect(responseErrorHandler(error500)).rejects.toEqual(
      expect.objectContaining({ status: 500 }),
    )
    expect(mockRequest).not.toHaveBeenCalled()
  })

  // 7. Network errors pass through unchanged
  it("should not retry network errors", async () => {
    const networkError = {
      request: {},
      config: { method: "get", url: "/test" },
    }

    await expect(responseErrorHandler(networkError)).rejects.toEqual(
      expect.objectContaining({ error: "Network Error", status: 0 }),
    )
    expect(mockRequest).not.toHaveBeenCalled()
  })

  // 8. Retry count increments on the config object
  it("should set __retryCount on the config after retry", async () => {
    jest.useFakeTimers()

    const config: any = { method: "get", url: "/test" }
    const error429 = {
      response: { status: 429, headers: { "retry-after": "0.1" } },
      config,
    }

    mockRequest.mockResolvedValue({ data: {}, status: 200 })

    const promise = responseErrorHandler(error429)

    jest.advanceTimersByTime(200)

    await promise
    expect(config.__retryCount).toBe(1)
    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ __retryCount: 1 }))

    jest.useRealTimers()
  })

  // 9. Success response passes through normally
  it("should pass through success responses unchanged", () => {
    const response = {
      status: 200,
      headers: {},
      config: { url: "/test" },
      data: { products: [] },
    }

    const result = responseSuccessHandler(response)
    expect(result).toBe(response)
  })
})
