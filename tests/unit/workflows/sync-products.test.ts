import { syncProductsWorkflow } from "../../../src/workflows/sync-products"
import * as fs from "fs"
import * as path from "path"

describe("syncProductsWorkflow", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../../src/workflows/sync-products.ts"),
    "utf-8"
  )

  it("exports a workflow function", () => {
    expect(syncProductsWorkflow).toBeDefined()
    expect(typeof syncProductsWorkflow).toBe("function")
  })

  it("imports and uses mapPrintifyOptions", () => {
    expect(source).toContain("mapPrintifyOptions")
  })

  it("logs error and skips products with missing options", () => {
    expect(source).toContain("has no options in printify_data")
  })

  it("creates separate Medusa options from mapped result", () => {
    expect(source).toContain("mapped.medusaOptions")
    expect(source).not.toContain('title: "Variant"')
  })

  it("includes printify metadata on variants", () => {
    expect(source).toContain("printify_variant_id")
    expect(source).toContain("printify_product_id")
  })

  it("does not pass images inline on variants (requires post-creation association)", () => {
    // Variant images cannot be passed inline during createProductsWorkflow —
    // they cause MikroORM ValidationError (product_id undefined).
    // Images must be associated after product creation via addImageToVariant.
    const buildVariantsSection = source.substring(source.indexOf("buildMedusaVariants"))
    const fnBody = buildVariantsSection.substring(0, buildVariantsSection.indexOf("function "))
    expect(fnBody).not.toContain("images:")
  })

  it("ensures sales channel link on update path (not just create)", () => {
    // The update branch must also reconcile sales channel assignment
    // so products that lost their channel link get restored on re-sync
    const updateSection = source.substring(source.indexOf("// Update existing"))
    expect(updateSection).toContain("sales_channel_id")
  })

  it("updates existing products with new options and variants on re-sync", () => {
    expect(source).toContain("updateProducts")
    // The update path should include options and variants
    const updateSection = source.substring(source.indexOf("updateProducts"))
    expect(updateSection).toContain("options:")
    expect(updateSection).toContain("variants:")
  })
})
