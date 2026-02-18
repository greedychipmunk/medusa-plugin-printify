import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import type PrintifyModuleService from "../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import { logger } from "../../../../modules/printify/utils/logger"
import { PrintifyPluginError } from "../../../../modules/printify/utils/error-handling"

const listProductsQuerySchema = z.object({
  page: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().int().min(1)).default("1"),
  limit: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().int().min(1).max(100)).default("20"),
  enabled: z.enum(["true", "false"]).optional().transform((val) => (val ? val === "true" : undefined)),
  search: z.string().optional(),
  sort: z.enum(["title", "created_at", "updated_at", "last_sync_at"]).default("updated_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
})

const apiLogger = logger

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || "default-store"
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    apiLogger.info("Listing products", { storeId })

    const queryValidation = listProductsQuerySchema.safeParse(req.query)
    if (!queryValidation.success) {
      res.status(400).json({
        success: false,
        error: "Validation error",
        message: "Invalid query parameters",
        details: queryValidation.error.issues,
      })
      return
    }

    const query = queryValidation.data

    const config = await printifyService.getConfigurationByStoreId(storeId)
    if (!config) {
      res.status(400).json({
        success: false,
        error: "ENTITY_NOT_FOUND",
        message: "Configuration not found for store",
      })
      return
    }

    const result = await printifyService.getProductsByConfiguration(config.id, {
      page: query.page,
      limit: Math.min(query.limit, 100),
      enabled: query.enabled,
      search: query.search,
      sort: query.sort,
      order: query.order,
    })

    res.status(200).json({
      success: true,
      data: {
        products: result.products.map((product: any) => ({
          id: product.id,
          printify_product_id: product.printify_product_id,
          medusa_product_id: product.medusa_product_id,
          title: product.title,
          description: product.description,
          enabled: product.enabled,
          last_sync_at: product.last_sync_at,
          created_at: product.created_at,
          updated_at: product.updated_at,
        })),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          total_pages: result.total_pages,
          has_more: result.page * result.limit < result.total,
        },
        filters: {
          enabled: query.enabled,
          search: query.search,
          sort: query.sort,
          order: query.order,
        },
      },
    })
  } catch (error) {
    apiLogger.error("Failed to list products", error as Error)

    if (error instanceof PrintifyPluginError) {
      res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      })
      return
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to retrieve products",
    })
  }
}
