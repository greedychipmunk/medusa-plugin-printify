import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"

const toggleSchema = z.object({
  sync_enabled: z.boolean().optional(),
  auto_submit_orders: z.boolean().optional(),
}).refine(
  (data) => data.sync_enabled !== undefined || data.auto_submit_orders !== undefined,
  { message: "At least one toggle field must be provided" },
)

export async function PUT(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || "default-store"
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const validationResult = toggleSchema.safeParse(req.body)
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Validation error",
        message: validationResult.error.issues[0]?.message || "Invalid request data",
        details: validationResult.error.issues,
      })
      return
    }

    const existing = await printifyService.getConfigurationByStoreId(storeId)
    if (!existing) {
      res.status(404).json({
        success: false,
        error: "Configuration not found",
        message: "No Printify configuration exists for this store",
      })
      return
    }

    const toggleData = validationResult.data
    const updatePayload: Record<string, any> = { id: existing.id }

    if (toggleData.sync_enabled !== undefined) {
      updatePayload.sync_enabled = toggleData.sync_enabled
    }
    if (toggleData.auto_submit_orders !== undefined) {
      updatePayload.auto_submit_orders = toggleData.auto_submit_orders
    }

    await printifyService.updatePrintifyConfigurations([updatePayload])

    res.status(200).json({
      success: true,
      data: {
        sync_enabled: toggleData.sync_enabled ?? existing.sync_enabled,
        auto_submit_orders: toggleData.auto_submit_orders ?? existing.auto_submit_orders,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to toggle automation settings",
    })
  }
}
