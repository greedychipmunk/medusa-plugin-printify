import {
  createWorkflow,
  createStep,
  WorkflowResponse,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import {
  PrintifyCreateOrderPayload,
  PrintifyAddress,
} from "../modules/printify/api-client"

export type CreatePrintifyOrderInput = {
  medusaOrderId: string
  shopId: string
  lineItems: Array<{
    product_id: string
    variant_id: number
    quantity: number
    printify_product_id: string
  }>
  shippingMethod: number
  address: {
    firstName: string
    lastName: string
    email: string
    phone: string
    address1: string
    address2?: string
    city: string
    province: string
    postalCode: string
    countryCode: string
  }
}

type BuildPayloadOutput = {
  payload: PrintifyCreateOrderPayload
  address: PrintifyAddress
}

const buildOrderPayloadStep = createStep(
  "printify-build-order-payload-step",
  async (input: CreatePrintifyOrderInput): Promise<StepResponse<BuildPayloadOutput>> => {
    const address: PrintifyAddress = {
      first_name: input.address.firstName,
      last_name: input.address.lastName,
      email: input.address.email,
      phone: input.address.phone,
      address1: input.address.address1,
      address2: input.address.address2,
      city: input.address.city,
      region: input.address.province,
      zip: input.address.postalCode,
      country: input.address.countryCode.toUpperCase(),
    }

    const payload: PrintifyCreateOrderPayload = {
      external_id: input.medusaOrderId,
      label: `Medusa Order ${input.medusaOrderId}`,
      line_items: input.lineItems.map((item) => ({
        product_id: item.printify_product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
      })),
      shipping_method: input.shippingMethod,
      send_shipping_notification: false,
      address_to: address,
    }

    return new StepResponse({ payload, address })
  }
)

const createOrderInPrintifyStep = createStep(
  "printify-create-order-in-printify-step",
  async (
    { payload, shopId }: { payload: PrintifyCreateOrderPayload; shopId: string },
    { container }
  ) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
    const order = await service.getApiClient().createOrder(shopId, payload)
    return new StepResponse(order, order.id)
  },
  async (printifyOrderId: string) => {
    console.warn(
      `[printify] compensation: order ${printifyOrderId} may need manual cancellation in Printify`
    )
  }
)

type PersistOrderInput = {
  printifyOrder: { id: string; status: string }
  input: CreatePrintifyOrderInput
  address: PrintifyAddress
}

const persistLocalOrderStep = createStep(
  "printify-persist-local-order-step",
  async ({ printifyOrder, input, address }: PersistOrderInput, { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)

    // Capture variant costs immutably at order creation time
    const costPerItem: Record<string, number> = {}
    let totalCost = 0

    for (const item of input.lineItems) {
      const products = await service.listPrintifyProducts({
        printify_id: String(item.printify_product_id),
      })
      if (products.length > 0) {
        const product = products[0]
        const variants = (product.variants as unknown as Array<{ id: number; cost: number }>) || []
        const variant = variants.find((v) => v.id === item.variant_id)
        if (variant) {
          costPerItem[`${item.printify_product_id}:${item.variant_id}`] = variant.cost
          totalCost += variant.cost * item.quantity
        }
      }
    }

    const created = await service.createPrintifyOrders([
      {
        printify_id: String(printifyOrder.id),
        shop_id: input.shopId,
        medusa_order_id: input.medusaOrderId,
        status: printifyOrder.status || "pending",
        shipping_method: String(input.shippingMethod),
        line_items: input.lineItems as unknown as Record<string, unknown>,
        address_to: address,
        total_cost: totalCost || null,
        cost_per_item: Object.keys(costPerItem).length > 0 ? costPerItem : null,
        submitted_at: null,
      },
    ])

    const localOrder = Array.isArray(created) ? created[0] : created

    return new StepResponse({
      printifyOrderId: printifyOrder.id,
      localOrderId: localOrder.id as string,
      status: printifyOrder.status,
    })
  }
)

export const createPrintifyOrderWorkflow = createWorkflow(
  "create-printify-order",
  (input: CreatePrintifyOrderInput) => {
    const { payload, address } = buildOrderPayloadStep(input)
    const printifyOrder = createOrderInPrintifyStep({ payload, shopId: input.shopId })
    const result = persistLocalOrderStep({ printifyOrder, input, address })
    return new WorkflowResponse(result)
  }
)
