// IMPORTANT: resetMocks:true clears mock implementations between tests.
// MedusaService is called at class-definition time (in the `extends` clause),
// so the mock factory must return MockBase immediately — beforeEach is too late
// for that initial call. MockBase is defined at module scope so it is
// available when the factory runs.
class MockBase {
  listPrintifyShops = jest.fn()
  createPrintifyShops = jest.fn()
  updatePrintifyShops = jest.fn()
  listPrintifyProducts = jest.fn()
  createPrintifyProducts = jest.fn()
  updatePrintifyProducts = jest.fn()
  listPrintifyOrders = jest.fn()
  createPrintifyOrders = jest.fn()
  updatePrintifyOrders = jest.fn()
}

jest.mock("@medusajs/framework/utils", () => ({
  MedusaService: jest.fn(() => MockBase),
  model: {
    define: jest.fn(),
    id: jest.fn(() => ({ primaryKey: jest.fn().mockReturnThis() })),
    text: jest.fn(() => ({
      nullable: jest.fn().mockReturnThis(),
      unique: jest.fn().mockReturnThis(),
      default: jest.fn().mockReturnThis(),
    })),
    boolean: jest.fn(() => ({ default: jest.fn().mockReturnThis() })),
    json: jest.fn(() => ({ nullable: jest.fn().mockReturnThis() })),
    number: jest.fn(() => ({ nullable: jest.fn().mockReturnThis() })),
    dateTime: jest.fn(() => ({ nullable: jest.fn().mockReturnThis() })),
  },
}))

jest.mock("axios", () => ({
  __esModule: true,
  default: { create: jest.fn() },
}))

import { MedusaService } from "@medusajs/framework/utils"
import axios from "axios"
import { PrintifyModuleService } from "../../../../src/modules/printify/service"

beforeEach(() => {
  ;(MedusaService as jest.Mock).mockReturnValue(MockBase)
  ;(axios.create as jest.Mock).mockReturnValue({
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    interceptors: { response: { use: jest.fn() } },
  })
})

describe("PrintifyModuleService", () => {
  it("instantiates without throwing", () => {
    const service = new PrintifyModuleService({}, { options: { apiKey: "k", webhookSecret: "s" } })
    expect(service).toBeDefined()
  })

  it("getApiClient returns a PrintifyApiClient instance", () => {
    const service = new PrintifyModuleService({}, { options: { apiKey: "k", webhookSecret: "s" } })
    const client = service.getApiClient()
    expect(client).toBeDefined()
    expect(typeof client.getShops).toBe("function")
  })

  it("getOptions returns the module options", () => {
    const opts = { apiKey: "my-key", webhookSecret: "my-secret", shopId: "shop-1" }
    const service = new PrintifyModuleService({}, { options: opts })
    expect(service.getOptions()).toEqual(opts)
  })
})
