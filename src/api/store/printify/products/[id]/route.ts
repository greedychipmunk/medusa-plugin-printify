import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { logger } from "../../../../../modules/printify/utils/logger"
import { ErrorCode } from "../../../../../modules/printify/utils/error-handling"

const apiLogger = logger.child("StoreProductDetailAPI")

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const { id } = req.params

    if (!id) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Product ID is required",
          type: "validation_error",
        },
      })
      return
    }

    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
    const product = await printifyService.getStorefrontProduct(id)

    if (!product) {
      res.status(404).json({
        error: {
          code: ErrorCode.PRODUCT_NOT_FOUND,
          message: "Product not found",
          type: "not_found",
        },
      })
      return
    }

    // Fetch linked Medusa product data if available
    let medusaProductHandle: string | null = null
    let medusaProductThumbnail: string | null = null
    try {
      const enriched = await printifyService.getProductWithMedusaData(id)
      if (enriched?.product) {
        medusaProductHandle = enriched.product.handle || null
        medusaProductThumbnail = enriched.product.thumbnail || null
      }
    } catch {
      // Non-fatal: linked data may not be available
    }

    res.json({
      data: {
        id: product.id,
        title: product.title,
        description: product.description,
        enabled: product.enabled,
        medusa_product_id: (product as any).medusa_product_id || null,
        medusa_handle: medusaProductHandle,
        medusa_thumbnail: medusaProductThumbnail,
        created_at: product.created_at,
        updated_at: product.updated_at,
        breadcrumbs: [
          { name: "Home", url: "/" },
          { name: "Products", url: "/products" },
          { name: product.title, url: `/products/${product.id}` },
        ],
      },
    })
  } catch (error) {
    apiLogger.error("Failed to fetch product details", error as Error)
    res.status(500).json({
      error: {
        code: ErrorCode.API_SERVER_ERROR,
        message: "Failed to fetch product details",
        type: "server_error",
      },
    })
  }
}
