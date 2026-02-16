import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { logger } from "../../../../../modules/printify/utils/logger"

const apiLogger = logger.child("AdminProductStatsAPI")

const SYNC_STALE_MS = 60 * 60 * 1000 // 1 hour

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const [products, total] = await printifyService.listAndCountPrintifyProducts({})

    let enabled_products = 0
    let disabled_products = 0
    let needs_sync = 0
    let linked_to_medusa = 0
    let available_products = 0

    const now = Date.now()

    for (const product of products) {
      if (product.enabled) {
        enabled_products++
        available_products++
      } else {
        disabled_products++
      }

      const lastSync = product.last_sync_at ? new Date(product.last_sync_at).getTime() : 0
      if (!product.last_sync_at || now - lastSync > SYNC_STALE_MS) {
        needs_sync++
      }

      if (product.medusa_product_id) {
        linked_to_medusa++
      }
    }

    res.json({
      success: true,
      data: {
        total_products: total,
        enabled_products,
        disabled_products,
        needs_sync,
        linked_to_medusa,
        available_products,
      },
    })
  } catch (error) {
    apiLogger.error("Failed to get product statistics", error as Error)
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to retrieve product statistics",
    })
  }
}
