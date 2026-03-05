import axios from "axios"
import { PrintifyApiClient } from "../../../../src/modules/printify/api-client"

jest.mock("axios", () => ({
  __esModule: true,
  default: { create: jest.fn() },
}))

let mockAxiosInstance: { get: jest.Mock; post: jest.Mock; put: jest.Mock; delete: jest.Mock }

beforeEach(() => {
  mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
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
    mockAxiosInstance.get.mockResolvedValue({ data: [{ id: "123", title: "My Shop" }] })
    const result = await client.getShops()
    expect(mockAxiosInstance.get).toHaveBeenCalledWith("/shops.json")
    expect(result).toEqual([{ id: "123", title: "My Shop" }])
  })
})
