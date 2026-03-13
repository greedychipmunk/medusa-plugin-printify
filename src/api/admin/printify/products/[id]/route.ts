import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
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

// PATCH /admin/printify/products/:id — toggle product visibility
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { is_published } = req.body as { is_published: unknown }

  if (typeof is_published !== "boolean") {
    return res.status(400).json({ message: "is_published must be a boolean" })
  }

  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const [product] = await service.updatePrintifyProducts({
    selector: { id: req.params.id },
    data: { is_published, visibility_override: is_published },
  })

  try {
    const { data } = await query.graph({
      entity: "printify_product",
      fields: ["product.id"],
      filters: { id: product.id },
    })

    if (data.length > 0 && data[0].product?.id) {
      const medusaProductId: string = data[0].product.id
      const productModuleService = req.scope.resolve("product")
      await productModuleService.updateProducts([
        { id: medusaProductId, status: is_published ? "published" : "draft" },
      ])
    }
  } catch {
    // Link module not configured or Medusa product update failed — continue
  }

  res.json({ product })
}
