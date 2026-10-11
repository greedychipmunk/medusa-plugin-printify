import reconcilePublishing from "../../../src/scripts/reconcile-publishing"
import { syncProductsWorkflow } from "../../../src/workflows/sync-products"
import { computeEffectiveVisibility, isPrintifyPublished } from "../../../src/workflows/visibility"

jest.mock("../../../src/workflows/sync-products", () => ({ syncProductsWorkflow: jest.fn() }))

describe("explicit publishing reconciliation", () => {
  let state: { visible: boolean; is_locked: boolean; external: unknown }
  let status: string
  let hide: boolean | null
  let trace: string[]
  let run: jest.Mock
  let client: Record<string, jest.Mock>
  let query: { graph: jest.Mock }
  let products: { updateProducts: jest.Mock }
  let service: Record<string, jest.Mock>
  let logger: Record<string, jest.Mock>

  beforeEach(() => {
    state = { visible: true, is_locked: true, external: null }
    status = "published"
    hide = null
    trace = []
    client = {
      getProducts: jest.fn().mockImplementation(async () => ({ data: [{ id: "upstream", ...state }], last_page: 1 })),
      getProduct: jest.fn().mockImplementation(async () => { trace.push("read"); return { ...state } }),
      setPublishSucceeded: jest.fn().mockImplementation(async (_shop, _id, external) => {
        trace.push("ack")
        expect(status).toBe("draft")
        state.is_locked = false
        state.external = external
      }),
      setPublishFailed: jest.fn().mockImplementation(async () => { state.is_locked = false }),
    }
    service = {
      getApiClient: jest.fn().mockReturnValue(client),
      updatePrintifyProducts: jest.fn().mockResolvedValue([]),
      getOptions: jest.fn().mockReturnValue({ shopId: "shop", webhookBaseUrl: "https://store.test/" }),
    }
    query = { graph: jest.fn().mockResolvedValue({ data: [{ product: { id: "medusa", handle: "shirt" } }] }) }
    products = { updateProducts: jest.fn().mockImplementation(async (_id, data) => { status = data.status; trace.push("draft") }) }
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    run = jest.fn().mockImplementation(async () => {
      trace.push("sync")
      status = computeEffectiveVisibility({ is_published: isPrintifyPublished(state), is_locked: state.is_locked, visibility_override: hide, printify_data: state })
      return { result: {} }
    })
    ;(syncProductsWorkflow as unknown as jest.Mock).mockReturnValue({ run })
  })

  // Minimal Medusa exec container double; business orchestration runs unchanged.
  const execute = () => reconcilePublishing({ container: { resolve: (key: string) => ({ printify: service, product: products, query, logger })[key] } } as any)

  it("prepares a private draft and confirms completion before storefront promotion", async () => {
    await execute()
    expect(trace).toEqual(["sync", "read", "draft", "ack", "read", "sync"])
    expect(status).toBe("published")
    expect(client.setPublishSucceeded).toHaveBeenCalledWith("shop", "upstream", { id: "medusa", handle: "https://store.test/products/shirt" })
    expect(client.setPublishFailed).not.toHaveBeenCalled()
    expect(service.updatePrintifyProducts).toHaveBeenNthCalledWith(1, {
      selector: { printify_id: "upstream" },
      data: { is_published: false, is_locked: true, printify_data: { visible: true, is_locked: true, external: null } },
    })
    expect(service.updatePrintifyProducts).toHaveBeenNthCalledWith(2, {
      selector: { printify_id: "upstream" },
      data: { is_published: true, is_locked: false, printify_data: { ...state } },
    })
  })

  it("preserves hide intent while completing an explicit pending publication", async () => {
    hide = false
    await execute()
    expect(client.setPublishSucceeded).toHaveBeenCalledTimes(1)
    expect(status).toBe("draft")
  })

  it("is idempotent after successful completion", async () => {
    await execute()
    await execute()
    expect(client.setPublishSucceeded).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("rechecks a stale pending listing without acknowledging an already completed request", async () => {
    client.getProduct.mockResolvedValue({ visible: true, is_locked: false, external: { id: "medusa", handle: "https://store.test/products/shirt" } })
    await execute()
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(client.setPublishFailed).not.toHaveBeenCalled()
  })

  it("does not treat a stale pending listing followed by unlocked external:null as completed", async () => {
    client.getProduct.mockResolvedValue({ visible: true, is_locked: false, external: null })
    await expect(execute()).rejects.toThrow("reconciliation incomplete")
    expect(status).toBe("draft")
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(client.setPublishFailed).not.toHaveBeenCalled()
    expect(service.updatePrintifyProducts).toHaveBeenCalledWith({
      selector: { printify_id: "upstream" },
      data: { is_published: false, is_locked: false, printify_data: { visible: true, is_locked: false, external: null } },
    })
  })

  it.each([null, {}, { id: "medusa", handle: "" }])("rejects post-ack unlock with invalid external proof %p", async external => {
    client.setPublishSucceeded.mockImplementation(async () => { state.is_locked = false; state.external = external })
    await expect(execute()).rejects.toThrow("reconciliation incomplete")
    expect(status).toBe("draft")
    expect(run).toHaveBeenCalledTimes(1)
    expect(client.setPublishFailed).not.toHaveBeenCalled()
  })

  it("keeps failed-publication unlock private on rerun", async () => {
    client.setPublishSucceeded.mockRejectedValue(new Error("ack offline"))
    await expect(execute()).rejects.toThrow("reconciliation incomplete")
    expect(state).toEqual({ visible: true, is_locked: false, external: null })
    await execute()
    expect(status).toBe("draft")
    expect(client.setPublishSucceeded).toHaveBeenCalledTimes(1)
    expect(client.setPublishFailed).toHaveBeenCalledTimes(1)
  })

  it.each(["prepare", "read"])("keeps private on %s failure without canceling an unverified request", async failure => {
    if (failure === "prepare") run.mockRejectedValue(new Error("offline"))
    else client.getProduct.mockRejectedValue(new Error("offline"))
    await expect(execute()).rejects.toThrow("reconciliation incomplete")
    expect(status).toBe("draft")
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(client.setPublishFailed).not.toHaveBeenCalled()
  })

  it("reports a confirmed pending request failed on acknowledgment failure", async () => {
    client.setPublishSucceeded.mockRejectedValue(new Error("ack offline"))
    await expect(execute()).rejects.toThrow("reconciliation incomplete")
    expect(status).toBe("draft")
    expect(client.setPublishFailed).toHaveBeenCalledWith("shop", "upstream", "ack offline")
  })

  it.each(["read", "sync", "locked"])("does not misreport upstream failure for post-ack %s failure", async failure => {
    if (failure === "read") client.getProduct.mockResolvedValueOnce({ ...state }).mockRejectedValueOnce(new Error("offline"))
    if (failure === "sync") run.mockImplementationOnce(async () => { status = "draft" }).mockRejectedValueOnce(new Error("offline"))
    if (failure === "locked") client.setPublishSucceeded.mockResolvedValue(undefined)
    await expect(execute()).rejects.toThrow("reconciliation incomplete")
    expect(status).toBe("draft")
    expect(client.setPublishSucceeded).toHaveBeenCalledTimes(1)
    expect(client.setPublishFailed).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('"stage":"confirmed_refresh"'))
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("succeeded=1 failed=0 refresh_failed=1"))
  })

  it.each([
    { visible: false, is_locked: true }, { visible: true, is_locked: false },
    { visible: true }, { visible: "true", is_locked: true }, { visible: true, is_locked: "true" }, {},
  ])("never completes unrelated or malformed publication requests %p", async flags => {
    client.getProducts.mockResolvedValue({ data: [{ id: "upstream", ...flags }], last_page: 1 })
    await execute()
    expect(run).not.toHaveBeenCalled()
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(client.setPublishFailed).not.toHaveBeenCalled()
  })

  it("paginates upstream candidates rather than silently omitting later pending products", async () => {
    client.getProducts.mockResolvedValueOnce({ data: [], last_page: 2 }).mockResolvedValueOnce({ data: [{ id: "upstream", ...state }] })
    await execute()
    expect(client.getProducts).toHaveBeenNthCalledWith(2, "shop", 2, 50)
    expect(client.setPublishSucceeded).toHaveBeenCalledTimes(1)
  })
})
