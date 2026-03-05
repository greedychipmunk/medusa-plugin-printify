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
})
