import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { logger } from "../../../../../modules/printify/utils/logger"

const apiLogger = logger.child("AdminConfigTestAPI")

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || "default-store"
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    apiLogger.info("Testing configuration", { storeId })

    const testResult = await printifyService.testConfiguration(storeId)

    if (testResult.success) {
      res.status(200).json({
        success: true,
        message: "Configuration test successful",
        data: {
          connection_status: "connected",
          shop_info: testResult.shop_info,
        },
      })
    } else {
      res.status(400).json({
        success: false,
        error: "Connection test failed",
        message: testResult.error || "Failed to connect to Printify API",
        data: { connection_status: "failed" },
      })
    }
  } catch (error) {
    apiLogger.error("Failed to test configuration", error as Error)
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to test configuration",
    })
  }
}
