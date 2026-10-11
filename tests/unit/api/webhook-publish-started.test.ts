import { createHmac } from "crypto"
import { POST } from "../../../src/api/webhooks/printify/route"
import { syncProductsWorkflow } from "../../../src/workflows/sync-products"
import { computeEffectiveVisibility, isPrintifyPublished } from "../../../src/workflows/visibility"

jest.mock("../../../src/workflows/sync-products", () => ({ syncProductsWorkflow: jest.fn() }))

describe("product publication webhook behavior", () => {
  let remote: { visible?: unknown; is_locked?: unknown; external?: unknown }
  let status: string
  let hidden: boolean | null
  let trace: string[]
  let client: Record<string, jest.Mock>
  let service: Record<string, jest.Mock>
  let query: { graph: jest.Mock }
  let products: { updateProducts: jest.Mock }
  let run: jest.Mock

  beforeEach(() => {
    remote = { visible: true, is_locked: true, external: null }
    status = "published" // Simulate an already-public legacy linked product.
    hidden = null
    trace = []
    client = {
      getProduct: jest.fn().mockImplementation(async () => { trace.push("read"); return { ...remote } }),
      setPublishSucceeded: jest.fn().mockImplementation(async (_shop, _id, external) => {
        trace.push("ack")
        expect(status).toBe("draft")
        remote.is_locked = false
        remote.external = external
      }),
      setPublishFailed: jest.fn().mockImplementation(async () => { remote.is_locked = false }),
    }
    service = {
      getApiClient: jest.fn().mockReturnValue(client),
      getOptions: jest.fn().mockReturnValue({ webhookSecret: "secret", shopId: "shop", storefrontBaseUrl: "https://store.test/" }),
      updatePrintifyProducts: jest.fn().mockResolvedValue([]),
      listPrintifyOrders: jest.fn().mockResolvedValue([{ id: "order" }]),
      updatePrintifyOrders: jest.fn().mockResolvedValue([]),
    }
    query = { graph: jest.fn().mockImplementation(async () => ({ data: [{ product: { id: "medusa", handle: "shirt", status } }] })) }
    products = { updateProducts: jest.fn().mockImplementation(async (_id, data) => { status = data.status; trace.push("draft") }) }
    run = jest.fn().mockImplementation(async () => {
      trace.push("sync")
      status = computeEffectiveVisibility({ is_published: isPrintifyPublished(remote), is_locked: remote.is_locked !== false, visibility_override: hidden, printify_data: remote })
      return { result: {} }
    })
    ;(syncProductsWorkflow as unknown as jest.Mock).mockReturnValue({ run })
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  // Request/response doubles intentionally implement only the framework surface used by POST.
  async function deliver(type = "product:publish:started", data: Record<string, unknown> = { action: "create" }, valid = true) {
    const body = { type, shop_id: "shop", resource: { id: "printify", type: "product", data } }
    const rawBody = JSON.stringify(body)
    const req = {
      body, rawBody,
      headers: { "x-pfy-signature": valid ? createHmac("sha256", "secret").update(rawBody).digest("hex") : "bad" },
      scope: { resolve: (key: string) => ({ printify: service, query, product: products })[key] },
    }
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), sendStatus: jest.fn() }
    await POST(req as any, res as any)
    return res
  }

  it("prepares privately, acknowledges id/handle, and promotes only after confirmed refresh", async () => {
    const res = await deliver()
    expect(trace).toEqual(["sync", "read", "draft", "ack", "read", "sync"])
    expect(client.setPublishSucceeded).toHaveBeenCalledWith("shop", "printify", { id: "medusa", handle: "https://store.test/products/shirt" })
    expect(status).toBe("published")
    expect(client.setPublishFailed).not.toHaveBeenCalled()
    expect(res.sendStatus).toHaveBeenCalledWith(200)
    expect(service.updatePrintifyProducts).toHaveBeenNthCalledWith(1, {
      selector: { printify_id: "printify" },
      data: { is_published: false, is_locked: true, printify_data: { visible: true, is_locked: true, external: null } },
    })
    expect(service.updatePrintifyProducts).toHaveBeenNthCalledWith(2, {
      selector: { printify_id: "printify" },
      data: { is_published: true, is_locked: false, printify_data: { ...remote } },
    })
  })

  it("withdraws legacy public state for an unknown publish action without acknowledging it", async () => {
    const res = await deliver("product:publish:started", { action: "unknown" })
    expect(status).toBe("draft")
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(client.setPublishFailed).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it("preserves merchant hiding after successful upstream completion", async () => {
    hidden = false
    await deliver()
    expect(client.setPublishSucceeded).toHaveBeenCalledTimes(1)
    expect(status).toBe("draft")
  })

  it("does not re-acknowledge completed publications on repeat delivery", async () => {
    await deliver()
    await deliver()
    expect(client.setPublishSucceeded).toHaveBeenCalledTimes(1)
    expect(client.setPublishFailed).not.toHaveBeenCalled()
    expect(status).toBe("published")
  })

  it("keeps an acknowledgment failure private and reports the pending request failed", async () => {
    client.setPublishSucceeded.mockRejectedValue(new Error("ack offline"))
    const res = await deliver()
    expect(status).toBe("draft")
    expect(run).toHaveBeenCalledTimes(1)
    expect(client.setPublishFailed).toHaveBeenCalledWith("shop", "printify", "ack offline")
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it.each(["read", "sync", "still_locked"])("keeps private on post-success %s failure without reporting upstream failed", async failure => {
    if (failure === "read") client.getProduct.mockResolvedValueOnce(remote).mockRejectedValueOnce(new Error("read offline"))
    if (failure === "sync") run.mockImplementationOnce(async () => { status = "draft" }).mockRejectedValueOnce(new Error("sync offline"))
    if (failure === "still_locked") client.setPublishSucceeded.mockResolvedValue(undefined)
    const res = await deliver()
    expect(client.setPublishSucceeded).toHaveBeenCalledTimes(1)
    expect(client.setPublishFailed).not.toHaveBeenCalled()
    expect(status).toBe("draft")
    expect(res.status).toHaveBeenCalledWith(500)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"stage":"confirmed_refresh"'))
  })

  it("keeps a failed publication private on retry when failure unlocked it without external proof", async () => {
    client.setPublishSucceeded.mockRejectedValue(new Error("ack offline"))
    await deliver()
    expect(remote).toEqual({ visible: true, is_locked: false, external: null })
    const retry = await deliver()
    expect(status).toBe("draft")
    expect(client.setPublishSucceeded).toHaveBeenCalledTimes(1)
    expect(client.setPublishFailed).toHaveBeenCalledTimes(1)
    expect(retry.status).toHaveBeenCalledWith(500)
    expect(service.updatePrintifyProducts).toHaveBeenLastCalledWith({
      selector: { printify_id: "printify" },
      data: { is_published: false, is_locked: false, printify_data: { ...remote } },
    })
  })

  it.each([null, {}, { id: "medusa" }, { id: "", handle: "/products/shirt" }, { id: "medusa", handle: " " }])(
    "does not promote post-ack unlock lacking valid external evidence %p", async external => {
      client.setPublishSucceeded.mockImplementation(async () => { remote.is_locked = false; remote.external = external })
      const res = await deliver()
      expect(status).toBe("draft")
      expect(res.status).toHaveBeenCalledWith(500)
      expect(client.setPublishFailed).not.toHaveBeenCalled()
      expect(run).toHaveBeenCalledTimes(1)
    }
  )

  it("repairs a post-ack refresh failure on retry without acknowledging publication twice", async () => {
    client.getProduct.mockResolvedValueOnce({ ...remote }).mockRejectedValueOnce(new Error("read offline"))
    const first = await deliver()
    expect(first.status).toHaveBeenCalledWith(500)
    expect(status).toBe("draft")
    const retry = await deliver()
    expect(status).toBe("published")
    expect(client.setPublishSucceeded).toHaveBeenCalledTimes(1)
    expect(client.setPublishFailed).not.toHaveBeenCalled()
    expect(retry.sendStatus).toHaveBeenCalledWith(200)
  })

  it("demotes on a client configuration failure without touching upstream", async () => {
    service.getApiClient.mockImplementation(() => { throw new Error("not configured") })
    const res = await deliver()
    expect(status).toBe("draft")
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it("demotes on a preparation failure without canceling an unverified upstream request", async () => {
    run.mockRejectedValue(new Error("prepare offline"))
    await deliver()
    expect(status).toBe("draft")
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(client.setPublishFailed).not.toHaveBeenCalled()
  })

  it("demotes on a pre-ack read failure and does not acknowledge unknown state", async () => {
    client.getProduct.mockRejectedValue(new Error("read offline"))
    await deliver()
    expect(status).toBe("draft")
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(client.setPublishFailed).not.toHaveBeenCalled()
  })

  it("reports a confirmed pending request failed if private preparation cannot yield a link", async () => {
    query.graph.mockResolvedValue({ data: [] })
    await deliver()
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(client.setPublishFailed).toHaveBeenCalledWith("shop", "printify", expect.stringContaining("no linked"))
  })

  it.each([
    { visible: false, is_locked: false }, { visible: true },
    { visible: "true", is_locked: true }, { visible: true, is_locked: "false" }, {},
    { visible: true, is_locked: false, external: null },
    { visible: true, is_locked: false, external: { id: "medusa", handle: "" } },
  ])("fails closed for stale/invalid publication flags %p", async flags => {
    remote = flags
    const res = await deliver()
    expect(res.status).toHaveBeenCalledWith(500)
    expect(status).toBe("draft")
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(client.setPublishFailed).not.toHaveBeenCalled()
  })

  it.each(["product:publish:started", "product:deleted"])("immediately drafts on %s unpublish without completing any publication request", async type => {
    const res = await deliver(type, { action: "delete" })
    expect(status).toBe("draft")
    expect(service.updatePrintifyProducts).toHaveBeenCalledWith({ selector: { printify_id: "printify" }, data: { is_published: false, is_locked: true } })
    expect(run).not.toHaveBeenCalled()
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(client.setPublishFailed).not.toHaveBeenCalled()
    expect(res.sendStatus).toHaveBeenCalledWith(200)
  })

  it.each(["product:publish:started", "product:deleted"])("returns a retryable error instead of swallowing a %s demotion failure", async type => {
    products.updateProducts.mockRejectedValue(new Error("database offline"))
    const res = await deliver(type, { action: "delete" })
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.sendStatus).not.toHaveBeenCalled()
  })

  it("rejects invalid signatures before touching publication state", async () => {
    const res = await deliver("product:publish:started", { action: "create" }, false)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(run).not.toHaveBeenCalled()
    expect(products.updateProducts).not.toHaveBeenCalled()
  })

  it("preserves order status handling", async () => {
    await deliver("order:status-changed", { status: "fulfilled" })
    expect(service.updatePrintifyOrders).toHaveBeenCalledWith({ selector: { printify_id: "printify" }, data: { status: "fulfilled" } })
    expect(run).not.toHaveBeenCalled()
  })
})
