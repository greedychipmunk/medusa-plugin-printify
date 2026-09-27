import * as fs from "fs"
import * as path from "path"

describe("webhook route: product:publish:started handshake", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../../src/api/webhooks/printify/route.ts"),
    "utf-8"
  )

  it("routes product:publish:started to the handshake handler", () => {
    expect(source).toContain(`case "product:publish:started":`)
    expect(source).toContain("handleProductPublishStarted(")
  })

  it("completes the handshake with publishing_succeeded after sync", () => {
    expect(source).toContain("syncProductsWorkflow(container).run(")
    expect(source).toContain("client.setPublishSucceeded(shopId, printifyProductId, {")
    expect(source).toContain("id: medusaProduct.id,")
    expect(source).toContain("handle,")
  })

  it("reports publishing_failed with a reason when the handshake errors", () => {
    expect(source).toContain("client.setPublishFailed(shopId, printifyProductId, reason)")
  })

  it("skips the handshake for delete (unpublish) actions", () => {
    expect(source).toContain(`action === "delete"`)
  })

  it("builds the storefront handle from storefrontBaseUrl with webhookBaseUrl fallback", () => {
    expect(source).toContain("options.storefrontBaseUrl ?? options.webhookBaseUrl")
    expect(source).toContain("`${base}/products/${medusaProduct.handle}`")
  })
})

describe("sync workflow: locked products are treated as published", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../../src/workflows/sync-products.ts"),
    "utf-8"
  )

  it("computes printifyPublished from visible alone (is_locked is a mid-publish state)", () => {
    // For custom_integration shops, is_locked means Printify is waiting for
    // this plugin to acknowledge the publish. Treating locked+visible as
    // unpublished prevented the Medusa product from ever being created, so
    // the handshake could never complete — products stuck in "Publishing".
    expect(source).toContain("const printifyPublished = product.visible")
    expect(source).not.toContain("product.visible && !product.is_locked")
  })
})
