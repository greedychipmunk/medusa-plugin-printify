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
      // Printify 8502 means the order can't be sent to production in its
      // current state (e.g. it was already canceled on Printify's side).
      // Retrying forever is pointless — sync the real status from Printify
      // so the order leaves the pending queue instead of erroring every run.
      if (order.printify_id && err instanceof Error && err.message.includes('"code":8502')) {
        try {
          const remote = await service.getApiClient().getOrder(shopId, order.printify_id as string)
          await service.updatePrintifyOrders(
            { id: order.id as string },
            { status: remote.status }
          )
          console.warn(
            `[printify] auto-submit-orders-job: order ${order.id as string} not submittable ` +
              `(Printify status: ${remote.status}) — synced status, skipping further retries`
          )
          continue
        } catch (syncErr) {
          console.error(
            `[printify] auto-submit-orders-job: failed to sync status for order ${order.id as string}:`,
            syncErr
          )
          continue
        }
      }
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
