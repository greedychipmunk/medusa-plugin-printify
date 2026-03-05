import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import PrintifyModuleService from "../../../../modules/printify/service"

// GET /admin/printify/orders
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const { status, medusa_order_id, limit = "50", offset = "0" } = req.query as Record<
    string,
    string
  >

  const filters: Record<string, unknown> = {}
  if (status) filters.status = status
  if (medusa_order_id) filters.medusa_order_id = medusa_order_id

  const orders = await service.listPrintifyOrders(filters)
  const paginated = orders.slice(Number(offset), Number(offset) + Number(limit))

  res.json({ orders: paginated, count: orders.length })
}
