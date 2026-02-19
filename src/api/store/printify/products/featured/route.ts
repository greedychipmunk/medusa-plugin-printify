import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { logger } from "../../../../../modules/printify/utils/logger"
import { ErrorCode } from "../../../../../modules/printify/utils/error-handling"

const apiLogger = logger.child("StoreFeaturedProductsAPI")

function getPreviewImageUrl(images: any): string | null {
  if (!Array.isArray(images) || images.length === 0) return null
  const defaultImg = images.find((img: any) => img.is_default)
  return (defaultImg || images[0])?.src || null
}

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    const limit = Math.min(parseInt(req.query.limit as string) || 8, 20)

    const result = await printifyService.getStorefrontProducts({
      limit,
      offset: 0,
    })

    res.json({
      data: result.products.map((product: any) => ({
        id: product.id,
        title: product.title,
        description: product.description,
        enabled: product.enabled,
        preview_image_url: getPreviewImageUrl(product.images),
        created_at: product.created_at,
        updated_at: product.updated_at,
      })),
      meta: { count: result.products.length, limit },
    })
  } catch (error) {
    apiLogger.error("Failed to fetch featured products", error as Error)
    res.status(500).json({
      error: {
        code: ErrorCode.API_SERVER_ERROR,
        message: "Failed to fetch featured products",
        type: "server_error",
      },
    })
  }
}
