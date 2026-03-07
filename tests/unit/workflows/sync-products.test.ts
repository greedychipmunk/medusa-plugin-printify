import { syncProductsWorkflow } from "../../../src/workflows/sync-products"

describe("syncProductsWorkflow", () => {
  it("exports a workflow function", () => {
    expect(syncProductsWorkflow).toBeDefined()
    expect(typeof syncProductsWorkflow).toBe("function")
  })
})
