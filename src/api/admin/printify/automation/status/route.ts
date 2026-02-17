import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { automationActivityStore } from "../../../../../modules/printify/utils/automation-activity"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || "default-store"
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const configuration = await printifyService.getConfigurationByStoreId(storeId)

    if (!configuration) {
      res.status(404).json({
        success: false,
        error: "Configuration not found",
        message: "No Printify configuration exists for this store",
      })
      return
    }

    const activity = automationActivityStore.get(configuration.id)

    res.status(200).json({
      success: true,
      data: {
        configuration: {
          sync_enabled: configuration.sync_enabled,
          sync_frequency: configuration.sync_frequency,
          auto_submit_orders: configuration.auto_submit_orders,
        },
        product_sync: activity.product_sync,
        order_auto_submit: activity.order_auto_submit,
        updated_at: activity.updated_at,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to retrieve automation status",
    })
  }
}
