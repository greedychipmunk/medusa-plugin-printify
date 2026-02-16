import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { logger } from "../../../../../modules/printify/utils/logger"

const apiLogger = logger.child("AdminProductSyncAPI")

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || "default-store"
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    apiLogger.info("Starting product sync from Printify", { storeId })

    const config = await printifyService.getConfigurationByStoreId(storeId)
    if (!config) {
      res.status(400).json({
        success: false,
        error: "ENTITY_NOT_FOUND",
        message: "Configuration not found for store",
      })
      return
    }

    const result = await printifyService.syncProducts(config.id)

    res.json({
      success: true,
      message: "Product sync completed successfully",
      data: {
        sync_summary: {
          products_synced: result.synced_count || 0,
          products_failed: result.failed_count || 0,
          products_skipped: result.skipped_count || 0,
          sync_log_id: result.sync_log_id,
        },
      },
    })
  } catch (error) {
    apiLogger.error("Failed to sync products", error as Error)
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to sync products from Printify",
    })
  }
}
