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

jest.mock("@medusajs/framework/utils", () => {
  // A single fully-chainable factory: every DML method (text/boolean/json/...)
  // returns the same shape, exposing every chain method we currently use plus
  // every one we plausibly will. Adding a new .nullable()/.default()/.unique()
  // to any model field will not require touching this mock again.
  //
  // Defined inside the jest.mock() factory rather than at module scope so the
  // mock cannot be accidentally broken by a future refactor to a const arrow
  // (which would not be hoisted ahead of this jest.mock call).
  //
  // See AGENTS.md "Coding Conventions — DML nullable fields" for context.
  function makeDmlChain() {
    const chain: Record<string, jest.Mock> = {}
    for (const method of ["nullable", "unique", "default", "primaryKey"]) {
      chain[method] = jest.fn(() => chain)
    }
    return chain
  }

  return {
    MedusaService: jest.fn(() => MockBase),
    model: {
      define: jest.fn(),
      id: jest.fn(() => makeDmlChain()),
      text: jest.fn(() => makeDmlChain()),
      boolean: jest.fn(() => makeDmlChain()),
      json: jest.fn(() => makeDmlChain()),
      number: jest.fn(() => makeDmlChain()),
      dateTime: jest.fn(() => makeDmlChain()),
    },
  }
})

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

  describe("onApplicationStart hook (webhook registration trigger)", () => {
    // These tests prove the trigger is wired, not just that the registration
    // logic works: Medusa invokes `instance.__hooks.onApplicationStart` at boot.
    it("exposes an onApplicationStart hook", () => {
      const service = new PrintifyModuleService({}, { options: { apiKey: "k", webhookSecret: "s" } })
      expect(typeof service.__hooks?.onApplicationStart).toBe("function")
    })

    it("registers signed webhooks when the hook runs", async () => {
      jest.spyOn(console, "log").mockImplementation(() => {})
      const get = jest.fn().mockResolvedValue({ data: [{ id: "old", topic: "order:shipped", secret: "" }] })
      const post = jest.fn().mockResolvedValue({ data: {} })
      const del = jest.fn().mockResolvedValue({ data: {} })
      ;(axios.create as jest.Mock).mockReturnValue({
        get,
        post,
        delete: del,
        interceptors: { response: { use: jest.fn() } },
      })
      const service = new PrintifyModuleService({}, {
        options: {
          apiKey: "k",
          webhookSecret: "sekrit",
          shopId: "shop1",
          webhookBaseUrl: "https://example.com",
        },
      })

      await service.__hooks!.onApplicationStart!()

      expect(get).toHaveBeenCalledWith("/shops/shop1/webhooks.json")
      expect(del).toHaveBeenCalledWith("/shops/shop1/webhooks/old.json")
      expect(post).toHaveBeenCalledWith(
        "/shops/shop1/webhooks.json",
        expect.objectContaining({
          topic: "order:shipped",
          url: "https://example.com/webhooks/printify",
          secret: "sekrit",
        })
      )
      jest.restoreAllMocks()
    })

    it("resolves without registering when webhook config is absent", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => {})
      const get = jest.fn()
      ;(axios.create as jest.Mock).mockReturnValue({
        get,
        post: jest.fn(),
        delete: jest.fn(),
        interceptors: { response: { use: jest.fn() } },
      })
      const service = new PrintifyModuleService({}, { options: { apiKey: "k", webhookSecret: "s" } })

      await expect(service.__hooks!.onApplicationStart!()).resolves.toBeUndefined()
      expect(get).not.toHaveBeenCalled()
      jest.restoreAllMocks()
    })
  })
})
