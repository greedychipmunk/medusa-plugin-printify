// Exercise the actual registered workflow callbacks, not source-text matches.
jest.mock("@medusajs/framework/workflows-sdk", () => {
  const steps: Record<string, Function> = {}
  return {
    __steps: steps,
    createStep: (name: string, callback: Function) => { steps[name] = callback; return jest.fn() },
    createWorkflow: () => jest.fn(),
    StepResponse: class { constructor(public output: unknown) {} },
    WorkflowResponse: class { constructor(public output: unknown) {} },
  }
})
jest.mock("@medusajs/medusa/core-flows", () => ({
  createProductsWorkflow: jest.fn(), updateProductsWorkflow: jest.fn(),
}))
jest.mock("../../../src/modules/printify", () => ({ PRINTIFY_MODULE: "printify" }))
jest.mock("../../../src/utils/currency-converter", () => ({
  ...jest.requireActual("../../../src/utils/currency-converter"), fetchExchangeRates: jest.fn(),
}))

import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import "../../../src/workflows/sync-products"

const steps = jest.requireMock("@medusajs/framework/workflows-sdk").__steps
const runStep = (name: string, input: unknown, services: Record<string, unknown>) =>
  steps[name](input, { container: { resolve: (key: string) => {
    if (!(key in services)) throw new Error(`Unexpected prerequisite resolution: ${key}`)
    return services[key]
  } } })
const mirrorStep = "printify-create-medusa-products-step"
const fixture = () => ({
  id: "pp_1", printify_id: "remote_1", shop_id: "shop1", title: "Fixture tee", description: "",
  is_published: true, is_locked: false, visibility_override: null as boolean | null,
  variants: [{ id: 1, sku: "SKU-S", cost: 500, price: 1000, title: "S", is_enabled: true, is_default: true, options: [10] }],
  images: [], print_areas: [],
  printify_data: {
    visible: true, is_locked: false, external: { id: "medusa_1", handle: "https://example.test/products/tee" } as { id: string; handle: string } | null,
    options: [{ name: "Size", type: "size", values: [{ id: 10, title: "S" }] }],
  },
})

describe("authoritative publication sync callbacks", () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

  it.each([true, false, null])("refreshes upstream facts despite local override %s", async override => {
    const row = { ...fixture(), visibility_override: override }
    const update = jest.fn().mockImplementation(async ({ data }) => { Object.assign(row, data); return [row] })
    const service = { listPrintifyProducts: jest.fn().mockResolvedValue([row]), updatePrintifyProducts: update }
    await runStep("printify-upsert-products-step", {
      shopId: "shop1", products: [{ ...row, id: row.printify_id, visible: false, is_locked: true }],
    }, { printify: service })
    expect(row).toMatchObject({ is_published: false, is_locked: true, visibility_override: override })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ is_published: false, is_locked: true }) }))
  })

  it("repairs legacy visible rows absent from a complete upstream catalog", async () => {
    const row = { ...fixture(), visibility_override: true }
    const update = jest.fn().mockImplementation(async ({ data }) => { Object.assign(row, data); return [row] })
    await runStep("printify-upsert-products-step", { shopId: "shop1", products: [] }, {
      printify: { listPrintifyProducts: jest.fn().mockResolvedValue([row]), updatePrintifyProducts: update },
    })
    expect(row).toMatchObject({ is_published: false, visibility_override: true })
  })

  it.each([
    { is_published: false, is_locked: false, visibility_override: true },
    { is_published: true, is_locked: true, visibility_override: true },
    { is_published: true, is_locked: false, visibility_override: false },
  ])("demotes ineligible linked products before all mapping/shipping/channel/rate prerequisites: %s", async state => {
    const row = { ...fixture(), ...state, variants: [], printify_data: null }
    const updateProducts = jest.fn().mockResolvedValue({})
    const result = await runStep(mirrorStep, { shopId: "shop1" }, {
      printify: { listPrintifyProducts: jest.fn().mockResolvedValue([row]) },
      [ContainerRegistrationKeys.QUERY]: { graph: jest.fn().mockResolvedValue({ data: [{ product: { id: "medusa_1" } }] }) },
      [ContainerRegistrationKeys.LINK]: {}, [ContainerRegistrationKeys.LOGGER]: logger,
      [Modules.PRODUCT]: { updateProducts },
    })
    expect(updateProducts).toHaveBeenCalledWith("medusa_1", { status: "draft" })
    expect(result.output).toEqual({ created: 0, updated: 1 })
    expect(createProductsWorkflow).not.toHaveBeenCalled()
  })

  it("never creates an upstream draft, even with legacy true override", async () => {
    await runStep(mirrorStep, { shopId: "shop1" }, {
      printify: { listPrintifyProducts: jest.fn().mockResolvedValue([{ ...fixture(), is_published: false, visibility_override: true }]) },
      [ContainerRegistrationKeys.QUERY]: { graph: jest.fn().mockResolvedValue({ data: [] }) },
      [ContainerRegistrationKeys.LINK]: {}, [ContainerRegistrationKeys.LOGGER]: logger,
      [Modules.PRODUCT]: {},
    })
    expect(createProductsWorkflow).not.toHaveBeenCalled()
  })

  it("prepares locked publications privately; repeat sync preserves the link; verified unlock permits promotion", async () => {
    const row = { ...fixture(), is_published: false, is_locked: true }
    row.printify_data = { ...row.printify_data, is_locked: true, external: null }
    let linked = false
    const create = jest.fn().mockResolvedValue({ result: [{ id: "medusa_1" }] })
    const update = jest.fn().mockResolvedValue({})
    jest.mocked(createProductsWorkflow).mockReturnValue({ run: create } as never)
    jest.mocked(updateProductsWorkflow).mockReturnValue({ run: update } as never)
    const services = {
      printify: { listPrintifyProducts: jest.fn().mockResolvedValue([row]), listPrintifyShops: jest.fn().mockResolvedValue([{ sales_channel_id: "sc1" }]) },
      [ContainerRegistrationKeys.QUERY]: { graph: jest.fn().mockImplementation(async () => ({ data: linked ? [{ product: { id: "medusa_1" } }] : [] })) },
      [ContainerRegistrationKeys.LINK]: { create: jest.fn().mockImplementation(async () => { linked = true }) },
      [ContainerRegistrationKeys.LOGGER]: logger,
      [Modules.PRODUCT]: {
        updateProducts: jest.fn().mockResolvedValue({}),
        retrieveProduct: jest.fn().mockResolvedValue({ images: [], variants: [], options: [{ id: "opt1", title: "Size" }] }),
        updateProductOptionValuesOnProduct: jest.fn().mockResolvedValue({}),
      },
      [Modules.FULFILLMENT]: { listShippingProfiles: jest.fn().mockResolvedValue([{ id: "sp1" }]) },
      [Modules.REGION]: { listRegions: jest.fn().mockResolvedValue([{ currency_code: "usd" }]) },
    }
    await runStep(mirrorStep, { shopId: "shop1" }, services)
    expect(create.mock.calls[0][0].input.products[0].status).toBe("draft")
    await runStep(mirrorStep, { shopId: "shop1" }, services)
    expect(create).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    row.is_locked = false
    row.is_published = true
    row.printify_data = fixture().printify_data
    await runStep(mirrorStep, { shopId: "shop1" }, services)
    expect(update.mock.calls[0][0].input.products[0].status).toBe("published")
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("does not falsely succeed when withdrawing eligibility fails", async () => {
    await expect(runStep(mirrorStep, { shopId: "shop1" }, {
      printify: { listPrintifyProducts: jest.fn().mockResolvedValue([{ ...fixture(), is_published: false }]) },
      [ContainerRegistrationKeys.QUERY]: { graph: jest.fn().mockResolvedValue({ data: [{ product: { id: "medusa_1" } }] }) },
      [ContainerRegistrationKeys.LINK]: {}, [ContainerRegistrationKeys.LOGGER]: logger,
      [Modules.PRODUCT]: { updateProducts: jest.fn().mockRejectedValue(new Error("DB unavailable")) },
    })).rejects.toThrow("DB unavailable")
  })

  it("refuses malformed pagination rather than treating a partial fetch as complete", async () => {
    await expect(runStep("printify-fetch-all-products-step", { shopId: "shop1" }, {
      printify: { getApiClient: () => ({ getProducts: jest.fn().mockResolvedValue({ data: [], last_page: undefined }) }) },
    })).rejects.toThrow("Invalid catalog pagination")
  })

  it("verifies full publication evidence when a list projection omits it", async () => {
    const list = { id: "remote_1", visible: true, is_locked: false }
    const detail = { ...list, external: fixture().printify_data.external }
    const getProduct = jest.fn().mockResolvedValue(detail)
    const result = await runStep("printify-fetch-all-products-step", { shopId: "shop1" }, {
      printify: { getApiClient: () => ({ getProducts: jest.fn().mockResolvedValue({ data: [list], last_page: 1 }), getProduct }) },
      [ContainerRegistrationKeys.LOGGER]: logger,
    })
    expect(getProduct).toHaveBeenCalledWith("shop1", "remote_1")
    expect(result.output).toEqual([detail])
  })

  it.each(["failure", "different_resource"])("keeps unverified/default-visible data private after detail %s", async reason => {
    const list = { id: "remote_1", visible: true, is_locked: false }
    const getProduct = reason === "failure" ? jest.fn().mockRejectedValue(new Error("unavailable"))
      : jest.fn().mockResolvedValue({ ...list, id: "other", external: fixture().printify_data.external })
    const result = await runStep("printify-fetch-all-products-step", { shopId: "shop1" }, {
      printify: { getApiClient: () => ({ getProducts: jest.fn().mockResolvedValue({ data: [list], last_page: 1 }), getProduct }) },
      [ContainerRegistrationKeys.LOGGER]: logger,
    })
    expect(result.output).toEqual([list])
    expect(logger.error).toHaveBeenCalled()
  })
})
