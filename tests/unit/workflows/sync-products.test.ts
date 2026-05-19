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
    // The update branch must also reconcile sales channel assignment so
    // products that lost their channel link get restored on re-sync. The
    // current mechanism passes sales_channels: [{ id: salesChannelId }] in
    // the updateProductsWorkflow input, which causes the workflow to
    // (idempotently) maintain the product↔sales_channel link.
    //
    // History: an earlier implementation used an explicit link.create() with
    // a sales_channel_id payload; the regex below pins the current shape so
    // a future refactor that drops the link reconciliation gets caught.
    const updateSection = source.substring(source.indexOf("// Update existing"))
    expect(updateSection).toMatch(/sales_channels:\s*\[\{\s*id:\s*salesChannelId\b/)
  })

  it("associates variant images after product creation", () => {
    expect(source).toContain("addImageToVariant")
  })

  it("updates existing products with new options and variants on re-sync", () => {
    expect(source).toContain("updateProducts")
    // The update path should include options and variants
    const updateSection = source.substring(source.indexOf("updateProducts"))
    expect(updateSection).toContain("options:")
    expect(updateSection).toContain("variants:")
  })

  it("imports fetchExchangeRates from currency-converter", () => {
    expect(source).toContain("fetchExchangeRates")
  })

  it("imports buildVariantPrices from build-variant-prices", () => {
    expect(source).toContain("buildVariantPrices")
  })

  it("queries Medusa regions for currency codes", () => {
    expect(source).toContain("Modules.REGION")
    expect(source).toContain("listRegions")
  })

  it("passes currencies and rates to buildMedusaVariants", () => {
    const fnSignature = source.substring(
      source.indexOf("function buildMedusaVariants"),
      source.indexOf("{", source.indexOf("function buildMedusaVariants"))
    )
    expect(fnSignature).toContain("currencies")
    expect(fnSignature).toContain("rates")
  })

  it("no longer hardcodes usd currency_code", () => {
    expect(source).not.toContain('currency_code: "usd"')
  })

  it("does not pre-filter printify_products by is_published when selecting for Medusa sync", () => {
    // Bug fix: the only loop that updates Medusa product status used to filter
    // is_published: true, which prevented unpublished products from being demoted
    // to draft. We now select by shop_id only and branch inside the loop.
    const stepStart = source.indexOf("printify-create-medusa-products-step")
    expect(stepStart).toBeGreaterThan(-1)
    const stepBody = source.substring(stepStart, stepStart + 4000)
    const listCallMatch = stepBody.match(/listPrintifyProducts\(\{[\s\S]*?\}\)/)
    expect(listCallMatch).not.toBeNull()
    expect(listCallMatch![0]).not.toContain("is_published: true")
    expect(listCallMatch![0]).toContain("shop_id")
  })

  it("skips creating new Medusa products for unpublished printify_products", () => {
    // The "create new" branch (no medusaProductId) must early-return when
    // is_published is false, so we never create Medusa products for drafts.
    // The "update existing" branch must still run so we can demote.
    const createBranchStart = source.indexOf("if (!medusaProductId)")
    expect(createBranchStart).toBeGreaterThan(-1)
    const createBranchSnippet = source.substring(createBranchStart, createBranchStart + 300)
    expect(createBranchSnippet).toMatch(/if\s*\(\s*!pp\.is_published\s*\)/)
  })

  it("demotes existing Medusa products to draft when the printify_product is unpublished", () => {
    // The update branch already computes targetStatus from pp.is_published —
    // pin the logic so a future refactor doesn't drop it.
    expect(source).toContain('pp.is_published ? "published" : "draft"')
  })
})
