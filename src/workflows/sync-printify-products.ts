import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { PRINTIFY_MODULE } from "../modules/printify"
import type PrintifyModuleService from "../modules/printify/service"
import type { SyncProductsResult } from "../modules/printify/service"

// ── Types ──────────────────────────────────────────────────────────

type SyncInput = {
  config_id: string
  force?: boolean
  max_age_minutes?: number
}

// ── Steps ──────────────────────────────────────────────────────────

const fetchPrintifyProductsStep = createStep(
  "fetch-printify-products",
  async (input: SyncInput, { container }) => {
    const printifyService: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
    const config = await printifyService.retrievePrintifyConfiguration(input.config_id)

    const { PrintifyApiClient } = await import("../modules/printify/services/printify-api-client.js")
    let resolvedLogger: any
    try {
      resolvedLogger = container.resolve("logger")
    } catch {
      // logger not available in this context
    }
    const apiClient = new PrintifyApiClient({
      apiKey: config.printify_api_key,
      shopId: config.printify_shop_id,
      logger: resolvedLogger,
    })

    const allProducts: any[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const response = await apiClient.getProducts(page, 100)
      allProducts.push(...response.data)
      hasMore = page < response.last_page
      page++
    }

    return new StepResponse({ products: allProducts, config_id: input.config_id })
  },
)

const upsertProductsStep = createStep(
  "upsert-printify-products",
  async (
    input: {
      products: any[]
      config_id: string
      force?: boolean
      max_age_minutes?: number
    },
    { container },
  ) => {
    const printifyService: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
    const { force = false, max_age_minutes = 60 } = input

    let syncedCount = 0
    let failedCount = 0
    let skippedCount = 0

    for (const apiProduct of input.products) {
      try {
        const [existing] = await printifyService.listPrintifyProducts({
          filters: {
            printify_product_id: apiProduct.id,
            configuration_id: input.config_id,
          },
        })

        if (existing) {
          if (
            !force &&
            existing.last_sync_at &&
            new Date().getTime() - new Date(existing.last_sync_at).getTime() <
              max_age_minutes * 60 * 1000
          ) {
            skippedCount++
            continue
          }

          await printifyService.updatePrintifyProducts([
            {
              id: existing.id,
              title: apiProduct.title,
              description: apiProduct.description,
              tags: apiProduct.tags,
              images: apiProduct.images,
              printify_data: apiProduct,
              last_sync_at: new Date(),
            },
          ] as any)
        } else {
          await printifyService.createPrintifyProducts([
            {
              printify_product_id: apiProduct.id,
              configuration_id: input.config_id,
              title: apiProduct.title,
              description: apiProduct.description,
              enabled: false,
              blueprint_id: apiProduct.blueprint_id.toString(),
              print_provider_id: "0",
              tags: apiProduct.tags,
              images: apiProduct.images,
              printify_data: apiProduct,
              last_sync_at: new Date(),
            },
          ] as any)
        }
        syncedCount++
      } catch {
        failedCount++
      }
    }

    return new StepResponse({
      synced_count: syncedCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
    })
  },
)

// ── Workflow ────────────────────────────────────────────────────────

export const syncPrintifyProductsWorkflow = createWorkflow(
  "sync-printify-products",
  (input: SyncInput) => {
    const fetched = fetchPrintifyProductsStep(input)

    const result = upsertProductsStep({
      products: fetched.products,
      config_id: fetched.config_id,
      force: input.force,
      max_age_minutes: input.max_age_minutes,
    })

    return new WorkflowResponse(result)
  },
)
