import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import PrintifyModuleService from "../../../../modules/printify/service"

// GET /admin/printify/shops — list synced shops
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const shops = await service.listPrintifyShops()
  res.json({ shops })
}

// POST /admin/printify/shops — trigger shop sync from Printify API
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { syncShopsWorkflow } = await import("../../../../workflows/sync-shops.js")
  const { result } = await syncShopsWorkflow(req.scope).run({ input: {} })
  res.json(result)
}
