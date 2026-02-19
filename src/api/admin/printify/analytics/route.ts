import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import { logger } from "../../../../modules/printify/utils/logger"

const apiLogger = logger.child("AdminAnalyticsAPI")

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const { date_from, date_to, config_id } = req.query

    let dateFrom: Date | undefined
    let dateTo: Date | undefined

    if (date_from) {
      dateFrom = new Date(date_from as string)
      if (isNaN(dateFrom.getTime())) {
        res.status(400).json({
          success: false,
          error: "Validation error",
          message: "Invalid date_from parameter",
        })
        return
      }
    }

    if (date_to) {
      dateTo = new Date(date_to as string)
      if (isNaN(dateTo.getTime())) {
        res.status(400).json({
          success: false,
          error: "Validation error",
          message: "Invalid date_to parameter",
        })
        return
      }
    }

    const configId = config_id as string | undefined

    const analytics = await printifyService.getAnalyticsForConfig(configId, dateFrom, dateTo)

    res.json({
      success: true,
      data: analytics,
    })
  } catch (error) {
    apiLogger.error("Failed to get analytics", error as Error)
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to retrieve analytics",
    })
  }
}
