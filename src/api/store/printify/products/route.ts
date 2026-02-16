import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import { logger } from "../../../../modules/printify/utils/logger"
import { ErrorCode } from "../../../../modules/printify/utils/error-handling"

const apiLogger = logger.child("StoreProductsAPI")

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0)
    const search = req.query.search as string

    const result = await printifyService.getStorefrontProducts({
      filters: { search },
      limit,
      offset,
    })

    res.json({
      data: result.products.map((product: any) => ({
        id: product.id,
        title: product.title,
        description: product.description,
        enabled: product.enabled,
        medusa_product_id: product.medusa_product_id || null,
        created_at: product.created_at,
        updated_at: product.updated_at,
        url: `/products/${product.id}`,
      })),
      meta: {
        total: result.total,
        limit,
        offset,
        hasMore: result.hasMore,
        page: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(result.total / limit),
      },
    })
  } catch (error) {
    apiLogger.error("Failed to fetch storefront products", error as Error)
    res.status(500).json({
      error: {
        code: ErrorCode.API_SERVER_ERROR,
        message: "Failed to fetch products",
        type: "server_error",
      },
    })
  }
}
