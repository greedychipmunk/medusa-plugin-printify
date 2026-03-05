import {
  createWorkflow,
  createStep,
  WorkflowResponse,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { PrintifyShop } from "../modules/printify/api-client"

type SyncShopsInput = Record<string, never>

type SyncShopsOutput = {
  synced: number
}

const fetchShopsStep = createStep(
  "printify-fetch-shops-step",
  async (_input: SyncShopsInput, { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
    const shops = await service.getApiClient().getShops()
    return new StepResponse(shops)
  }
)

const upsertShopsStep = createStep(
  "printify-upsert-shops-step",
  async (shops: PrintifyShop[], { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)

    for (const shop of shops) {
      const existing = await service.listPrintifyShops({ printify_id: shop.id })
      if (existing.length > 0) {
        await service.updatePrintifyShops(
          { printify_id: shop.id },
          { title: shop.title }
        )
      } else {
        await service.createPrintifyShops([{ printify_id: shop.id, title: shop.title }])
      }
    }

    return new StepResponse({ synced: shops.length })
  }
)

export const syncShopsWorkflow = createWorkflow(
  "sync-printify-shops",
  (input: SyncShopsInput) => {
    const shops = fetchShopsStep(input)
    const result = upsertShopsStep(shops)
    return new WorkflowResponse(result)
  }
)
