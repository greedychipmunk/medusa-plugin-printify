import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { logger } from "../../../../../modules/printify/utils/logger"

const apiLogger = logger.child("AdminOrderStatsAPI")

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const { date_from, date_to } = req.query

    let dateFrom: Date | undefined
    let dateTo: Date | undefined

    if (date_from) {
      dateFrom = new Date(date_from as string)
    }
    if (date_to) {
      dateTo = new Date(date_to as string)
    }

    const stats = await printifyService.getOrderStatsForConfig()

    res.json({
      success: true,
      data: {
        stats: {
          total_orders: stats.total,
          pending_orders: stats.pending,
          processing_orders: stats.processing,
          shipped_orders: stats.shipped,
          delivered_orders: stats.delivered,
          cancelled_orders: stats.cancelled,
          failed_orders: stats.failed,
          total_value: stats.totalValue,
          average_processing_time_hours: stats.averageProcessingTime,
          currency: stats.currency,
          date_range: {
            from: dateFrom?.toISOString(),
            to: dateTo?.toISOString(),
          },
        },
      },
    })
  } catch (error) {
    apiLogger.error("Failed to get order statistics", error as Error)
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to retrieve order statistics",
    })
  }
}
