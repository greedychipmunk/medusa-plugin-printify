import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { logger } from "../../../../../modules/printify/utils/logger"

const apiLogger = logger.child("AdminWebhookEventDetailAPI")

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const eventId = req.params.id
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    if (!eventId) {
      res.status(400).json({ success: false, error: "Event ID is required" })
      return
    }

    const event = await printifyService.retrievePrintifyWebhookEvent(eventId)

    res.json({ success: true, data: { event } })
  } catch (error) {
    apiLogger.error("Failed to retrieve webhook event", error as Error)

    if ((error as any)?.message?.includes("not found") || (error as any)?.code === "ENTITY_NOT_FOUND") {
      res.status(404).json({ success: false, error: "Webhook event not found" })
      return
    }

    res.status(500).json({ success: false, error: "Internal server error" })
  }
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const eventId = req.params.id
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    if (!eventId) {
      res.status(400).json({ success: false, error: "Event ID is required" })
      return
    }

    // Verify it exists first
    await printifyService.retrievePrintifyWebhookEvent(eventId)

    await printifyService.deletePrintifyWebhookEvents([eventId])

    res.json({ success: true, message: "Webhook event deleted" })
  } catch (error) {
    apiLogger.error("Failed to delete webhook event", error as Error)

    if ((error as any)?.message?.includes("not found") || (error as any)?.code === "ENTITY_NOT_FOUND") {
      res.status(404).json({ success: false, error: "Webhook event not found" })
      return
    }

    res.status(500).json({ success: false, error: "Internal server error" })
  }
}
