import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../../modules/printify"
import { dispatchEvent } from "../../../../../webhooks/printify/route"
import { logger } from "../../../../../../modules/printify/utils/logger"

const apiLogger = logger.child("AdminWebhookEventReplayAPI")

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const eventId = req.params.id
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    if (!eventId) {
      res.status(400).json({ success: false, error: "Event ID is required" })
      return
    }

    const result = await printifyService.replayWebhookEvent(eventId, dispatchEvent)

    if (!result.success) {
      if (result.error === "Signature re-verification failed") {
        res.status(422).json({
          success: false,
          error: "Signature verification failed",
          message: "The event signature does not match the current webhook secret",
        })
        return
      }

      res.status(500).json({
        success: false,
        error: "Replay failed",
        message: result.error,
      })
      return
    }

    res.json({
      success: true,
      message: "Webhook event replayed successfully",
      data: { event_id: eventId, status: "replayed" },
    })
  } catch (error) {
    apiLogger.error("Failed to replay webhook event", error as Error)

    if ((error as any)?.message?.includes("not found") || (error as any)?.code === "ENTITY_NOT_FOUND") {
      res.status(404).json({ success: false, error: "Webhook event not found" })
      return
    }

    res.status(500).json({ success: false, error: "Internal server error" })
  }
}
