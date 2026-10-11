import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { IProductModuleService } from "@medusajs/types"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import PrintifyModuleService from "../../../../../modules/printify/service"
import { computeEffectiveVisibility, isPrintifyPublished } from "../../../../../workflows/visibility"

// GET /admin/printify/products/:id — get a single product with Medusa link
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const product = await service.retrievePrintifyProduct(req.params.id)

  let medusa_product_id: string | null = null
  try {
    const { data } = await query.graph({
      entity: "printify_product",
      fields: ["product.id"],
      filters: { id: product.id },
    })
    if (data.length > 0 && data[0].product?.id) {
      medusa_product_id = data[0].product.id
    }
  } catch {
    // Link module not configured or query failed — return null
  }

  res.json({ product, medusa_product_id })
}

/**
 * PATCH /admin/printify/products/:id
 * The legacy `is_published` request field expresses local visibility intent only.
 * Publication and lock flags are upstream facts; a show request verifies them.
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { is_published: show } = (req.body ?? {}) as { is_published?: unknown }
  if (typeof show !== "boolean") {
    return res.status(400).json({ message: "is_published must be a boolean" })
  }

  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const logFailure = (stage: string, error: unknown) => logger.error(JSON.stringify({
    event: "printify.admin.visibility_failed",
    product_id: req.params.id,
    requested_visibility: show,
    stage,
    error: error instanceof Error ? error.message : String(error),
  }))

  let existingProduct: Awaited<ReturnType<PrintifyModuleService["retrievePrintifyProduct"]>>
  try {
    existingProduct = await service.retrievePrintifyProduct(req.params.id)
  } catch (error) {
    logFailure("retrieve", error)
    return res.status(404).json({ error: "Product not found" })
  }

  let upstreamFlags: {
    is_published: boolean
    is_locked: boolean
    printify_data: Record<string, unknown> | null
  } | undefined
  let blocked = false
  if (show) {
    try {
      const remote = await service.getApiClient().getProduct(existingProduct.shop_id, existingProduct.printify_id)
      // Visible defaults to true in Printify; completed publication also needs
      // a valid external reference. Refresh the authoritative proof snapshot.
      upstreamFlags = {
        is_published: isPrintifyPublished(remote),
        is_locked: remote?.is_locked !== false,
        printify_data: remote && typeof remote === "object" && !Array.isArray(remote)
          ? remote as unknown as Record<string, unknown>
          : null,
      }
      blocked = !upstreamFlags.is_published
    } catch (error) {
      logFailure("verify_upstream", error)
      return res.status(503).json({
        error: "Unable to verify Printify publication. Try again later; storefront visibility was not enabled.",
      })
    }
  }

  const update = {
    ...upstreamFlags,
    // A rejected show must not erase an existing local hide preference.
    ...(blocked ? {} : { visibility_override: show }),
  }
  const effectiveProduct = { ...existingProduct, ...update }
  const status = computeEffectiveVisibility(effectiveProduct)

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "printify_product",
      fields: ["product.id", "product.sales_channels.id"],
      filters: { id: existingProduct.id },
    })
    const linkedProduct = data[0]?.product
    const productModuleService = linkedProduct?.id
      ? req.scope.resolve<IProductModuleService>(Modules.PRODUCT)
      : null

    // Demote first, even if persisting repaired flags subsequently fails.
    if (productModuleService && status === "draft") {
      await productModuleService.updateProducts(linkedProduct.id, { status })
    }

    let product: typeof existingProduct
    try {
      ;[product] = await service.updatePrintifyProducts({
        selector: { id: req.params.id },
        data: update,
      })
      if (!product) throw new Error("Product update returned no record")
    } catch (error) {
      logFailure("persist_visibility", error)
      return res.status(500).json({ error: "Failed to save storefront visibility. Please retry." })
    }

    // Persisted data cannot widen the verified/local-intent visibility ceiling.
    const savedStatus = status === "draft" ? "draft" : computeEffectiveVisibility(product)
    if (productModuleService && savedStatus === "draft" && status !== "draft") {
      await productModuleService.updateProducts(linkedProduct.id, { status: savedStatus })
    }
    if (productModuleService && savedStatus === "published") {
      const shops = await service.listPrintifyShops({ printify_id: product.shop_id })
      let salesChannelId: string | null = shops[0]?.sales_channel_id ?? null
      if (!salesChannelId) {
        const storeService = req.scope.resolve(Modules.STORE)
        const stores = await storeService.listStores({})
        salesChannelId = stores[0]?.default_sales_channel_id ?? null
      }
      if (salesChannelId && !linkedProduct.sales_channels?.some((channel: { id: string }) => channel.id === salesChannelId)) {
        const link = req.scope.resolve(ContainerRegistrationKeys.LINK)
        await link.create({
          [Modules.PRODUCT]: { product_id: linkedProduct.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
        })
      }
      await productModuleService.updateProducts(linkedProduct.id, { status: savedStatus })
    }

    if (blocked) {
      return res.status(409).json({
        error: "Publish in Printify first and wait for publishing to finish before showing this product on the storefront.",
        product,
      })
    }
    return res.json({ product })
  } catch (error) {
    logFailure("update_linked_product", error)
    return res.status(500).json({
      error: "Failed to update linked storefront product. Visibility may be partially saved; retry or sync the product.",
    })
  }
}
