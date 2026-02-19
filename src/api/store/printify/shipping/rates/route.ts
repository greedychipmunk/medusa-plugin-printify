import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import type PrintifyModuleService from "../../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import { PrintifyApiClient } from "../../../../../modules/printify/services/printify-api-client"
import { shippingRateCache } from "../../../../../modules/printify/utils/shipping-cache"
import { logger } from "../../../../../modules/printify/utils/logger"

const apiLogger = logger.child("StoreShippingRatesAPI")

const shippingRatesSchema = z.object({
  line_items: z
    .array(
      z.object({
        printify_product_id: z.string().min(1),
        printify_variant_id: z.number().int().positive(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "At least one line item is required"),
  address: z.object({
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    address1: z.string().min(1),
    address2: z.string().optional(),
    city: z.string().min(1),
    state_code: z.string().optional(),
    zip: z.string().min(1),
    country_code: z.string().length(2, "Country code must be 2 characters"),
  }),
})

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const validation = shippingRatesSchema.safeParse(req.body)
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: "Validation failed",
        details: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      })
      return
    }

    const { line_items, address } = validation.data

    // Check cache
    const cacheItems = line_items.map((i) => ({
      product_id: i.printify_product_id,
      variant_id: i.printify_variant_id,
      quantity: i.quantity,
    }))
    const cachedRates = shippingRateCache.get(cacheItems, address)
    if (cachedRates) {
      res.json({ shipping_options: cachedRates, cached: true })
      return
    }

    // Get configuration
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
    const [config] = await printifyService.listPrintifyConfigurations({})

    if (!config) {
      res.status(503).json({
        success: false,
        error: "Printify integration not configured",
      })
      return
    }

    const apiClient = new PrintifyApiClient({
      apiKey: config.printify_api_key,
      shopId: config.printify_shop_id,
      logger: req.scope.resolve("logger") as any,
    })

    const shippingRequest = {
      line_items: line_items.map((i) => ({
        product_id: i.printify_product_id,
        variant_id: i.printify_variant_id,
        quantity: i.quantity,
      })),
      address_to: {
        first_name: address.first_name,
        last_name: address.last_name,
        address1: address.address1,
        address2: address.address2,
        city: address.city,
        state_code: address.state_code,
        zip: address.zip,
        country_code: address.country_code,
      },
    }

    let rates
    try {
      rates = await apiClient.calculateShipping(shippingRequest)
    } catch (error) {
      apiLogger.error("Printify shipping API error", error as Error)
      res.status(502).json({
        success: false,
        error: "Failed to fetch shipping rates from Printify",
      })
      return
    }

    // Cache result
    shippingRateCache.set(cacheItems, address, rates)

    res.json({ shipping_options: rates, cached: false })
  } catch (error) {
    apiLogger.error("Unexpected error calculating shipping rates", error as Error)
    res.status(500).json({
      success: false,
      error: "Internal server error",
    })
  }
}
