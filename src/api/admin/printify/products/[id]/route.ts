import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { IProductModuleService } from "@medusajs/types"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import PrintifyModuleService from "../../../../../modules/printify/service"

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
 *
 * Toggles storefront visibility for a Printify product. Setting `is_published`
 * also sets `visibility_override` to a non-null value, which prevents the sync
 * job from overwriting this value in the future.
 *
 * NOTE: Once visibility is manually toggled, there is intentionally no UI path
 * to reset back to "follow Printify" (visibility_override = null). To restore
 * automatic sync behaviour, update `visibility_override` to null directly in
 * the database or via a future admin action.
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { is_published } = req.body as { is_published: unknown }

  if (typeof is_published !== "boolean") {
    return res.status(400).json({ message: "is_published must be a boolean" })
  }

  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Verify the product exists first
  let existingProduct: any
  try {
    existingProduct = await service.retrievePrintifyProduct(req.params.id)
  } catch {
    return res.status(404).json({ error: "Product not found" })
  }

  // Now update (product is known to exist)
  let product: any
  try {
    ;[product] = await service.updatePrintifyProducts({
      selector: { id: req.params.id },
      data: {
        is_published,
        // Set visibility_override to a boolean to mark this as an admin-set value (non-null = do not sync-overwrite)
        visibility_override: is_published,
      },
    })
  } catch (err) {
    return res.status(500).json({ error: "Failed to update product" })
  }

  try {
    const { data } = await query.graph({
      entity: "printify_product",
      fields: ["product.id"],
      filters: { id: product.id },
    })

    if (data.length > 0 && data[0].product?.id) {
      const medusaProductId: string = data[0].product.id
      const productModuleService = req.scope.resolve<IProductModuleService>("product")
      await productModuleService.updateProducts(medusaProductId, { status: is_published ? "published" : "draft" })
    }
  } catch {
    // Link module not configured or Medusa product update failed — continue
  }

  res.json({ product })
}
