import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRINTIFY_MODULE } from "../../../../../../modules/printify"
import PrintifyModuleService from "../../../../../../modules/printify/service"
import { submitPrintifyOrderWorkflow } from "../../../../../../workflows/submit-printify-order"

// POST /admin/printify/orders/:id/submit — manually submit a pending order
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const { shopId } = service.getOptions()

  if (!shopId) {
    return res.status(400).json({ error: "No shopId configured" })
  }

  const { result } = await submitPrintifyOrderWorkflow(req.scope).run({
    input: { localOrderId: id, shopId },
  })

  res.json(result)
}
