import { MedusaContainer } from "@medusajs/framework/types"
import { syncProductsWorkflow } from "../workflows/sync-products"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"

export default async function syncProductsJob(container: MedusaContainer) {
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const { shopId } = service.getOptions()

  if (!shopId) {
    console.warn("[printify] sync-products-job: no shopId configured, skipping")
    return
  }

  const { result } = await syncProductsWorkflow(container).run({
    input: { shopId },
  })

  console.log(`[printify] sync-products-job: created ${result.created}, updated ${result.updated} Medusa products`)
}

export const config = {
  name: "printify-sync-products",
  schedule: "0 * * * *",
}
