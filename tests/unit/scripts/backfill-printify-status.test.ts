import backfillPrintifyStatus, { reconcileMedusaStatus } from "../../../src/scripts/backfill-printify-status"

describe("reconcileMedusaStatus", () => {
  it.each([
    [false, false, null, "draft"], [false, true, true, "draft"],
    [true, true, true, "draft"], [true, false, null, "published"],
    [true, false, true, "published"], [true, false, false, "draft"],
    [true, undefined, true, "draft"], [true, "false", true, "draft"],
    ["true", false, true, "draft"], [undefined, false, true, "draft"],
  ])("flags published=%p locked=%p override=%p yield %p", (is_published, is_locked, visibility_override, target) => {
    const flags = {
      is_published, is_locked, visibility_override: visibility_override as boolean | null,
      printify_data: { visible: true, is_locked: false, external: { id: "medusa", handle: "https://store.test/products/shirt" } },
    }
    const opposite = target === "draft" ? "published" : "draft"
    expect(reconcileMedusaStatus(flags, opposite)).toBe(target)
    expect(reconcileMedusaStatus(flags, target as "published" | "draft")).toBeNull()
  })
  it.each([undefined, null, {}, { visible: true, is_locked: false, external: null },
    { visible: true, is_locked: false, external: { id: "medusa", handle: "" } }])(
    "cannot publish from legacy booleans without valid raw proof %p", printify_data => {
      expect(reconcileMedusaStatus({ is_published: true, is_locked: false, visibility_override: true, printify_data }, "published")).toBe("draft")
    }
  )
  it("leaves proposed/rejected statuses alone", () => {
    expect(reconcileMedusaStatus({ is_published: true, is_locked: false }, "proposed")).toBeNull()
    expect(reconcileMedusaStatus({ is_published: false }, "rejected")).toBeNull()
  })
})

describe("backfill fresh-source visibility repair", () => {
  let pp: Record<string, unknown>
  let status: string
  let client: Record<string, jest.Mock>
  let service: Record<string, jest.Mock>
  let products: { updateProducts: jest.Mock }
  let query: { graph: jest.Mock }
  let logger: Record<string, jest.Mock>

  beforeEach(() => {
    pp = {
      id: "local", printify_id: "upstream", shop_id: "shop", is_published: true, is_locked: false, visibility_override: true,
      // Stale local proof must never replace the fresh upstream snapshot.
      printify_data: { visible: true, is_locked: false, external: { id: "medusa", handle: "/products/old-shirt" } },
    }
    status = "published"
    client = {
      getProduct: jest.fn().mockResolvedValue({ visible: false, is_locked: false }),
      setPublishSucceeded: jest.fn(), setPublishFailed: jest.fn(),
    }
    service = {
      listPrintifyProducts: jest.fn().mockImplementation(async () => [pp]),
      getApiClient: jest.fn().mockReturnValue(client),
      updatePrintifyProducts: jest.fn().mockResolvedValue([]),
    }
    products = { updateProducts: jest.fn().mockImplementation(async (_id, data) => { status = data.status }) }
    query = { graph: jest.fn().mockImplementation(async () => ({ data: [{ product: { id: "medusa", status } }] })) }
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  })

  // Minimal DI container double for the Medusa exec entrypoint.
  const execute = () => backfillPrintifyStatus({ container: { resolve: (key: string) => ({ printify: service, query, product: products, logger })[key] } } as any)

  it("repairs contaminated local true flags using fresh upstream false and preserves intent", async () => {
    await execute()
    expect(client.getProduct).toHaveBeenCalledWith("shop", "upstream")
    expect(service.updatePrintifyProducts).toHaveBeenCalledWith({ selector: { id: "local" }, data: { is_published: false, is_locked: false, printify_data: { visible: false, is_locked: false } } })
    expect(products.updateProducts).toHaveBeenCalledWith("medusa", { status: "draft" })
    expect(pp.visibility_override).toBe(true)
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(client.setPublishFailed).not.toHaveBeenCalled()
  })

  it("uses fresh true facts rather than a contaminated local false flag", async () => {
    pp.is_published = false
    status = "draft"
    client.getProduct.mockResolvedValue({ visible: true, is_locked: false, external: { id: "medusa", handle: "https://store.test/products/shirt" } })
    await execute()
    expect(status).toBe("published")
  })

  it("preserves a merchant hide on an upstream published product", async () => {
    pp.visibility_override = false
    client.getProduct.mockResolvedValue({ visible: true, is_locked: false, external: { id: "medusa", handle: "https://store.test/products/shirt" } })
    await execute()
    expect(status).toBe("draft")
    expect(service.updatePrintifyProducts.mock.calls[0][0].data).not.toHaveProperty("visibility_override")
  })

  it.each([
    { visible: true, is_locked: true }, { visible: true },
    { visible: true, is_locked: "false" }, { visible: "true", is_locked: false }, {}, null,
    { visible: true, is_locked: false, external: null },
    { visible: true, is_locked: false },
    { visible: true, is_locked: false, external: { id: "medusa", handle: "" } },
    { visible: true, is_locked: false, external: { id: 42, handle: "/products/shirt" } },
  ])("keeps missing, malformed or pending flags %p private without acknowledging requests", async flags => {
    client.getProduct.mockResolvedValue(flags)
    await execute()
    expect(service.updatePrintifyProducts).toHaveBeenCalledWith({
      selector: { id: "local" },
      data: { is_published: false, is_locked: flags?.is_locked !== false, printify_data: flags },
    })
    expect(status).toBe("draft")
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(client.setPublishFailed).not.toHaveBeenCalled()
  })

  it.each(["read", "persist", "missing_shop"])("fails closed for %s failure, reports incomplete repair, never promotes from cached facts", async failure => {
    if (failure === "read") client.getProduct.mockRejectedValue(new Error("offline"))
    if (failure === "persist") {
      client.getProduct.mockResolvedValue({ visible: true, is_locked: false, external: { id: "medusa", handle: "https://store.test/products/shirt" } })
      service.updatePrintifyProducts.mockRejectedValue(new Error("database offline"))
    }
    if (failure === "missing_shop") pp.shop_id = null
    await expect(execute()).rejects.toThrow("repair operation(s) failed")
    expect(status).toBe("draft")
    expect(client.setPublishSucceeded).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('"printify_id":"upstream"'))
  })

  it("is idempotent on repeat repair", async () => {
    await execute()
    await execute()
    expect(products.updateProducts).toHaveBeenCalledTimes(1)
    expect(status).toBe("draft")
  })

  it("refreshes unlinked module facts without touching merchandise", async () => {
    query.graph.mockResolvedValue({ data: [] })
    await execute()
    expect(service.updatePrintifyProducts).toHaveBeenCalledTimes(1)
    expect(products.updateProducts).not.toHaveBeenCalled()
  })

  it("reports storefront demotion failures instead of silently succeeding", async () => {
    products.updateProducts.mockRejectedValue(new Error("database offline"))
    await expect(execute()).rejects.toThrow("repair operation(s) failed")
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('"stage":"apply_visibility"'))
  })
})
