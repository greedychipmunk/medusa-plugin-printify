import {
  createWorkflow,
  createStep,
  WorkflowResponse,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { PrintifyProduct } from "../modules/printify/api-client"

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
      const data = {
        printify_id: String(product.id),
        shop_id: shopId,
        title: product.title,
        description: product.description,
        variants: product.variants as unknown as Record<string, unknown>,
        images: product.images as unknown as Record<string, unknown>,
        print_areas: product.print_areas as unknown as Record<string, unknown>,
        printify_data: product as unknown as Record<string, unknown>,
        is_published: !product.is_locked,
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

export const syncProductsWorkflow = createWorkflow(
  "sync-printify-products",
  (input: SyncProductsInput) => {
    const products = fetchAllProductsStep(input)
    const result = upsertProductsStep({ products, shopId: input.shopId })
    return new WorkflowResponse(result)
  }
)
