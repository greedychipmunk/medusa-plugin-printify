import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import PrintifyModuleService from "../../../../modules/printify/service"

// GET /admin/printify/products
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const { shop_id, is_published, limit = "50", offset = "0" } = req.query as Record<
    string,
    string
  >

  const filters: Record<string, unknown> = {}
  if (shop_id) filters.shop_id = shop_id
  if (is_published !== undefined) filters.is_published = is_published === "true"

  const products = await service.listPrintifyProducts(filters)
  const paginated = products.slice(Number(offset), Number(offset) + Number(limit))

  res.json({
    products: paginated,
    count: products.length,
    offset: Number(offset),
    limit: Number(limit),
  })
}

// POST /admin/printify/products — trigger product sync
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const { shopId } = service.getOptions()

  if (!shopId) {
    return res.status(400).json({ error: "No shopId configured in plugin options" })
  }

  const { syncProductsWorkflow } = await import("../../../../workflows/sync-products.js")
  const { result } = await syncProductsWorkflow(req.scope).run({ input: { shopId } })
  res.json(result)
}
