import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import { logger } from "../../../../modules/printify/utils/logger"

const apiLogger = logger.child("AdminWebhookEventsAPI")

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const {
      event_type,
      processing_status,
      received_after,
      received_before,
      limit,
      offset,
    } = req.query as Record<string, string | undefined>

    const { events, total, hasMore } = await printifyService.listWebhookEventsFiltered({
      event_type,
      processing_status,
      received_after: received_after ? new Date(received_after) : undefined,
      received_before: received_before ? new Date(received_before) : undefined,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    })

    // Omit payload and signature from list response
    const summary = events.map(({ payload, signature, ...rest }: any) => rest)

    res.json({
      success: true,
      data: { events: summary, total, hasMore },
    })
  } catch (error) {
    apiLogger.error("Failed to list webhook events", error as Error)
    res.status(500).json({ success: false, error: "Internal server error", message: "Failed to list webhook events" })
  }
}
