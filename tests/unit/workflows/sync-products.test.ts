import { syncProductsWorkflow } from "../../../src/workflows/sync-products"
import * as fs from "fs"
import * as path from "path"

describe("syncProductsWorkflow", () => {
  it("exports a workflow function", () => {
    expect(syncProductsWorkflow).toBeDefined()
    expect(typeof syncProductsWorkflow).toBe("function")
  })

  it("sets is_published from is_locked in upsertProductsStep", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/workflows/sync-products.ts"),
      "utf-8"
    )
    // The data object must map is_locked → is_published
    expect(source).toContain("is_published: !product.is_locked")
  })
})
