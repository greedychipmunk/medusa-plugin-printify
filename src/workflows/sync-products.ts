import {
  createWorkflow,
  createStep,
  WorkflowResponse,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { IProductModuleService } from "@medusajs/types"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { PrintifyProduct, PrintifyVariant, PrintifyImage, PrintifyOption } from "../modules/printify/api-client"
import { mapPrintifyOptions } from "./option-mapper"

type SyncProductsInput = {
  shopId: string
}

const fetchAllProductsStep = createStep(
  "printify-fetch-all-products-step",
  async ({ shopId }: SyncProductsInput, { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
    const client = service.getApiClient()

    const products: PrintifyProduct[] = []
    let page = 1
    let lastPage = 1

    do {
      const response = await client.getProducts(shopId, page, 50)
      products.push(...response.data)
      lastPage = response.last_page
      page++
    } while (page <= lastPage)

    return new StepResponse(products)
  }
)

const upsertProductsStep = createStep(
  "printify-upsert-products-step",
  async (
    { products, shopId }: {
      products: PrintifyProduct[]
      shopId: string
    },
    { container }
  ) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)

    for (const product of products) {
      const existing = await service.listPrintifyProducts({ printify_id: String(product.id) })
      const printifyPublished = product.visible && !product.is_locked
      // visibility_override is null until an admin manually sets it;
      // MikroORM returns null (never undefined) for nullable boolean columns
      const shouldUpdateVisibility =
        existing.length === 0 ||
        existing[0].visibility_override === null

      const data = {
        printify_id: String(product.id),
        shop_id: shopId,
        title: product.title,
        description: product.description,
        variants: product.variants as unknown as Record<string, unknown>,
        images: product.images as unknown as Record<string, unknown>,
        print_areas: product.print_areas as unknown as Record<string, unknown>,
        printify_data: product as unknown as Record<string, unknown>,
        ...(shouldUpdateVisibility ? { is_published: printifyPublished } : {}),
      }
      if (existing.length > 0) {
        await service.updatePrintifyProducts({
          selector: { printify_id: String(product.id) },
          data,
        })
      } else {
        await service.createPrintifyProducts([data])
      }
    }

    return new StepResponse({ synced: products.length })
  }
)

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function buildMedusaVariants(
  enabledVariants: PrintifyVariant[],
  mapped: NonNullable<ReturnType<typeof mapPrintifyOptions>>,
  printifyProductId: string
) {
  return enabledVariants.map((v) => ({
    title: v.title,
    sku: v.sku || undefined,
    options: mapped.variantOptionMap.get(v.id) ?? {},
    prices: [
      {
        amount: v.price,
        currency_code: "usd",
      },
    ],
    manage_inventory: false,
    metadata: {
      printify_variant_id: v.id,
      printify_product_id: printifyProductId,
    },
    // Note: variant images must be associated AFTER product creation via
    // addImageToVariant — passing images inline causes MikroORM ValidationError
    // (product_id undefined). Variant image association is a separate step.
  }))
}

function extractPrintifyMappings(pp: { printify_data: unknown; variants: unknown; images: unknown }) {
  const printifyData = pp.printify_data as unknown as { options?: PrintifyOption[] } | null
  const printifyOptions = (printifyData?.options as PrintifyOption[]) ?? []
  const variants = (pp.variants as unknown as PrintifyVariant[]) ?? []
  const printifyImages = (pp.images as unknown as PrintifyImage[]) ?? []
  const enabledVariants = variants.filter((v) => v.is_enabled)
  const mapped = mapPrintifyOptions(printifyOptions, variants, printifyImages)
  return { variants, enabledVariants, printifyImages, mapped }
}

const createMedusaProductsStep = createStep(
  "printify-create-medusa-products-step",
  async ({ shopId, _upsertDone }: { shopId: string; _upsertDone?: unknown }, { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    const productModuleService = container.resolve<IProductModuleService>(Modules.PRODUCT)
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

    // Get all published printify products for this shop
    const printifyProducts = await service.listPrintifyProducts({
      shop_id: shopId,
      is_published: true,
    })

    if (printifyProducts.length === 0) {
      return new StepResponse({ created: 0, updated: 0 })
    }

    // Resolve shipping profile (first available)
    const fulfillmentService = container.resolve(Modules.FULFILLMENT)
    const shippingProfiles = await fulfillmentService.listShippingProfiles({})
    if (shippingProfiles.length === 0) {
      logger.warn("[printify] No shipping profiles found — skipping Medusa product creation")
      return new StepResponse({ created: 0, updated: 0 })
    }
    const shippingProfileId = shippingProfiles[0].id

    // Resolve sales channel: shop setting → store default → skip
    const shops = await service.listPrintifyShops({ printify_id: shopId })
    let salesChannelId: string | null = shops[0]?.sales_channel_id ?? null

    if (!salesChannelId) {
      const storeService = container.resolve(Modules.STORE)
      const stores = await storeService.listStores({})
      salesChannelId = stores[0]?.default_sales_channel_id ?? null

      if (salesChannelId) {
        logger.info(`[printify] Using store default sales channel: ${salesChannelId}`)
      }
    }

    if (!salesChannelId) {
      logger.error(
        `[printify] PRODUCTS WILL NOT APPEAR ON STOREFRONT — no sales channel configured. ` +
        `Set printify_shop.sales_channel_id via PATCH /admin/printify/shops/${shopId}, ` +
        `or set a default_sales_channel_id on the store. ` +
        `(${printifyProducts.length} published products waiting to sync)`
      )
      return new StepResponse({ created: 0, updated: 0 })
    }

    let created = 0
    let updated = 0

    for (const pp of printifyProducts) {
      // Check if a linked Medusa product already exists
      let medusaProductId: string | null = null
      try {
        const { data } = await query.graph({
          entity: "printify_product",
          fields: ["product.id"],
          filters: { id: pp.id },
        })
        if (data.length > 0 && data[0].product?.id) {
          medusaProductId = data[0].product.id
        }
      } catch {
        // Link query failed — treat as no link
      }

      const { enabledVariants, printifyImages, mapped } = extractPrintifyMappings(pp)

      if (enabledVariants.length === 0) {
        logger.warn(`[printify] Product "${pp.title}" has no enabled variants — skipping`)
        continue
      }

      if (!mapped) {
        logger.error(`[printify] Product "${pp.title}" (${pp.printify_id}) has no options in printify_data — skipping`)
        continue
      }

      if (!medusaProductId) {
        // Create a new Medusa product
        try {
          const { result } = await createProductsWorkflow(container).run({
            input: {
              products: [
                {
                  title: pp.title,
                  description: pp.description || undefined,
                  handle: slugify(pp.title),
                  status: "published" as const,
                  images: printifyImages.map((img) => ({ url: img.src })),
                  options: mapped.medusaOptions,
                  variants: buildMedusaVariants(enabledVariants, mapped, pp.printify_id),
                  sales_channels: [{ id: salesChannelId }],
                  shipping_profile_id: shippingProfileId,
                },
              ],
            },
          })

          const newProduct = result[0]

          // Create module link: printify_product ↔ product
          await link.create({
            [PRINTIFY_MODULE]: { printify_product_id: pp.id },
            [Modules.PRODUCT]: { product_id: newProduct.id },
          })

          created++
          logger.info(`[printify] Created Medusa product "${pp.title}" (${newProduct.id})`)
        } catch (err) {
          logger.error(`[printify] Failed to create Medusa product for "${pp.title}": ${err instanceof Error ? err.message : JSON.stringify(err)}`)
        }
      } else {
        // Update existing linked Medusa product
        try {
          const targetStatus = pp.is_published ? "published" : "draft"

          await productModuleService.updateProducts(medusaProductId, {
            title: pp.title,
            description: pp.description || undefined,
            status: targetStatus as any,
            images: printifyImages.map((img) => ({ url: img.src })),
            options: mapped.medusaOptions,
            variants: buildMedusaVariants(enabledVariants, mapped, pp.printify_id),
          })

          // Ensure sales channel link exists (idempotent — link.create is a no-op if already linked)
          try {
            await link.create({
              [Modules.PRODUCT]: { product_id: medusaProductId },
              [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
            })
          } catch (linkErr) {
            logger.debug(`[printify] Sales channel link for product ${medusaProductId}: ${linkErr}`)
          }

          updated++
          logger.info(`[printify] Updated Medusa product "${pp.title}" (${medusaProductId})`)
        } catch (err) {
          logger.error(`[printify] Failed to update Medusa product ${medusaProductId}: ${err instanceof Error ? err.message : JSON.stringify(err)}`)
        }
      }
    }

    return new StepResponse({ created, updated })
  }
)

export const syncProductsWorkflow = createWorkflow(
  "sync-printify-products",
  (input: SyncProductsInput) => {
    const products = fetchAllProductsStep(input)
    const upsertResult = upsertProductsStep({ products, shopId: input.shopId })
    const medusaResult = createMedusaProductsStep({ shopId: input.shopId, _upsertDone: upsertResult })
    return new WorkflowResponse(medusaResult)
  }
)
