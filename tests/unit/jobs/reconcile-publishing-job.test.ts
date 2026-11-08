import reconcilePublishingJob, { config } from "../../../src/jobs/reconcile-publishing-job"
import { syncProductsWorkflow } from "../../../src/workflows/sync-products"

jest.mock("../../../src/workflows/sync-products", () => ({ syncProductsWorkflow: jest.fn() }))

describe("printify-reconcile-publishing job", () => {
  let upstream: Record<string, { visible: boolean; is_locked: boolean; external: unknown }>
  let client: Record<string, jest.Mock>
  let service: Record<string, jest.Mock>
  let container: { resolve: (key: string) => unknown }

  beforeEach(() => {
    upstream = {
      stuck: { visible: false, is_locked: true, external: null },
      broken: { visible: true, is_locked: true, external: null },
      idle: { visible: true, is_locked: false, external: null },
    }
    client = {
      getProducts: jest.fn().mockImplementation(async () => ({
        data: Object.entries(upstream).map(([id, p]) => ({ id, ...p })), last_page: 1,
      })),
      getProduct: jest.fn().mockImplementation(async (_shop: string, id: string) => ({ ...upstream[id] })),
      setPublishSucceeded: jest.fn().mockImplementation(async (_shop: string, id: string, external: unknown) => {
        if (id === "broken") throw new Error("ack offline")
        upstream[id] = { ...upstream[id], is_locked: false, external }
      }),
      setPublishFailed: jest.fn().mockImplementation(async (_shop: string, id: string) => { upstream[id].is_locked = false }),
    }
    service = {
      getApiClient: jest.fn().mockReturnValue(client),
      getOptions: jest.fn().mockReturnValue({ shopId: "shop", storefrontBaseUrl: "https://store.test" }),
      updatePrintifyProducts: jest.fn().mockResolvedValue([]),
    }
    const query = { graph: jest.fn().mockResolvedValue({ data: [{ product: { id: "medusa", handle: "mat" } }] }) }
    const products = { updateProducts: jest.fn().mockResolvedValue([]) }
    container = { resolve: (key: string) => ({ printify: service, query, product: products })[key] }
    ;(syncProductsWorkflow as unknown as jest.Mock).mockReturnValue({ run: jest.fn().mockResolvedValue({ result: {} }) })
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it("runs well inside Printify's one-hour auto-unlock", () => {
    expect(config.schedule).toBe("*/10 * * * *")
  })

  it("completes every locked request, survives a per-product failure, and ignores unlocked products", async () => {
    await expect(reconcilePublishingJob(container as any)).resolves.toBeUndefined()
    expect(client.setPublishSucceeded).toHaveBeenCalledWith("shop", "stuck", { id: "medusa", handle: "https://store.test/products/mat" })
    expect(client.setPublishFailed).toHaveBeenCalledWith("shop", "broken", "ack offline")
    expect(client.setPublishSucceeded).not.toHaveBeenCalledWith("shop", "idle", expect.anything())
    expect(upstream.stuck.is_locked).toBe(false)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"locked":2,"succeeded":1,"skipped":0,"failed":1'))
  })

  it("is a no-op without a shop id", async () => {
    service.getOptions.mockReturnValue({})
    await reconcilePublishingJob(container as any)
    expect(client.getProducts).not.toHaveBeenCalled()
  })
})
