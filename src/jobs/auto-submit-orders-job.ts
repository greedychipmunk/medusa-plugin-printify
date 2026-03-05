import { MedusaContainer } from "@medusajs/framework/types"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { submitPrintifyOrderWorkflow } from "../workflows/submit-printify-order"

export default async function autoSubmitOrdersJob(container: MedusaContainer) {
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const { shopId } = service.getOptions()

  if (!shopId) {
    console.warn("[printify] auto-submit-orders-job: no shopId configured, skipping")
    return
  }

  const pendingOrders = await service.listPrintifyOrders({ status: "pending" })

  for (const order of pendingOrders) {
    try {
      await submitPrintifyOrderWorkflow(container).run({
        input: { localOrderId: order.id as string, shopId },
      })
      console.log(`[printify] auto-submit-orders-job: submitted order ${order.id as string}`)
    } catch (err) {
      console.error(
        `[printify] auto-submit-orders-job: failed for order ${order.id as string}:`,
        err
      )
    }
  }
}

export const config = {
  name: "printify-auto-submit-orders",
  schedule: "*/5 * * * *",
}
