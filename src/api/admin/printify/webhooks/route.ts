import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import { PrintifyApiClient } from "../../../../modules/printify/services/printify-api-client"
import { logger } from "../../../../modules/printify/utils/logger"

const webhookAdminLogger = logger.child("AdminWebhookAPI")

/**
 * GET /admin/printify/webhooks
 * List all registered webhooks from Printify
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
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
    })

    const webhooks = await apiClient.listWebhooks()

    res.status(200).json({ webhooks })
  } catch (error) {
    webhookAdminLogger.error("Failed to list webhooks", error as Error)
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to list webhooks",
    })
  }
}

/**
 * POST /admin/printify/webhooks
 * Register a new webhook with Printify
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const { topic, url } = req.body as { topic?: string; url?: string }

    if (!topic || !url) {
      res.status(400).json({
        success: false,
        error: "Validation error",
        message: "Both 'topic' and 'url' are required",
      })
      return
    }

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
    })

    const secret = config.webhook_secret || undefined
    const webhook = await apiClient.createWebhook(topic, url, secret)

    res.status(201).json({ webhook })
  } catch (error) {
    webhookAdminLogger.error("Failed to create webhook", error as Error)
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to create webhook",
    })
  }
}
