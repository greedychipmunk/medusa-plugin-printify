import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { PrintifyApiClient } from "../../../../../modules/printify/services/printify-api-client"
import { logger } from "../../../../../modules/printify/utils/logger"

const webhookAdminLogger = logger.child("AdminWebhookAPI")

/**
 * DELETE /admin/printify/webhooks/:id
 * Remove a webhook registration from Printify
 */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const webhookId = req.params.id as string

    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
    const [config] = await printifyService.listPrintifyConfigurations({})

    if (!config) {
      res.status(404).json({
        success: false,
        error: "Configuration not found",
        message: "No Printify configuration exists. Please configure the plugin first.",
      })
      return
    }

    const apiClient = new PrintifyApiClient({
      apiKey: config.printify_api_key,
      shopId: config.printify_shop_id,
      logger: req.scope.resolve("logger") as any,
    })

    await apiClient.deleteWebhook(webhookId)

    res.status(200).json({ success: true })
  } catch (error) {
    webhookAdminLogger.error("Failed to delete webhook", error as Error)
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to delete webhook",
    })
  }
}
