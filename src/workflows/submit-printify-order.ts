import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { PRINTIFY_MODULE } from "../modules/printify"
import type PrintifyModuleService from "../modules/printify/service"
import { PrintifyOrderStatus } from "../modules/printify/models/printify-order"
import { DEFAULT_SHIPPING_METHOD, normalizePrintifyAddress, validateShippingMethod } from "../modules/printify/utils/order-utils"

// ── Types ──────────────────────────────────────────────────────────

type SubmitInput = {
  order_id: string
  store_id: string
  shipping_method?: number
}

// ── Steps ──────────────────────────────────────────────────────────

const validateOrderStep = createStep(
  "validate-printify-order",
  async (input: SubmitInput, { container }) => {
    const printifyService: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
    const order = await printifyService.getOrderBridge(input.order_id)

    if (!order.canSubmit()) {
      throw new Error(
        `Order ${input.order_id} cannot be submitted in state "${order.status}"`,
      )
    }

    // Validate shipping method against Printify API
    const apiClient = await printifyService.getApiClientForStore(input.store_id)
    await validateShippingMethod(apiClient, order, input.shipping_method)

    return new StepResponse({
      order_id: input.order_id,
      store_id: input.store_id,
      shipping_method: (input as any).shipping_method,
    })
  },
)

const submitToPrintifyStep = createStep(
  "submit-to-printify-api",
  async (
    input: { order_id: string; store_id: string; shipping_method?: number },
    { container },
  ) => {
    const printifyService: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
    const apiClient = await printifyService.getApiClientForStore(input.store_id)
    const order = await printifyService.getOrderBridge(input.order_id)

    // Prepare Printify order payload
    const printifyOrderData = {
      external_id: order.medusaOrderId,
      label: `Medusa Order ${order.medusaOrderId}`,
      line_items: order.items.map((item: any) => ({
        product_id: item.printifyProductId,
        variant_id: item.printifyVariantId,
        quantity: item.quantity,
        print_areas: item.customization
          ? [
              {
                variant_ids: [item.printifyVariantId],
                placeholders: item.customization.personalizationFields || {},
              },
            ]
          : undefined,
      })),
      shipping_method: input.shipping_method || order.shippingMethod || DEFAULT_SHIPPING_METHOD,
      send_shipping_notification: true,
      address_to: normalizePrintifyAddress(order.shippingAddress),
    }

    const response = await apiClient.createOrder(printifyOrderData)

    if (!response || !response.id) {
      throw new Error("Invalid response from Printify API — missing order ID")
    }

    return new StepResponse(
      { printify_order_id: response.id, order_id: input.order_id },
      // Compensation data: cancel the Printify order if later steps fail
      { printify_order_id: response.id, store_id: input.store_id },
    )
  },
  // Compensation: cancel the order on Printify
  async (compensationData, { container }) => {
    if (!compensationData) return
    const printifyService: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
    try {
      const apiClient = await printifyService.getApiClientForStore(compensationData.store_id)
      await apiClient.cancelOrder(compensationData.printify_order_id)
    } catch {
      // Best-effort cancellation — log but don't throw
    }
  },
)

const updateOrderRecordStep = createStep(
  "update-order-record",
  async (
    input: { printify_order_id: string; order_id: string },
    { container },
  ) => {
    const printifyService: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)

    await printifyService.updatePrintifyOrders([
      {
        id: input.order_id,
        status: PrintifyOrderStatus.SUBMITTED,
        printify_order_id: input.printify_order_id,
        submitted_at: new Date(),
        error_details: null,
      },
    ])

    const order = await printifyService.getOrderBridge(input.order_id)

    // Create module link to Medusa order if not already linked
    try {
      const { Modules } = await import("@medusajs/framework/utils")
      const link = container.resolve("link") as any
      await link.create({
        [PRINTIFY_MODULE]: { printify_order_id: input.order_id },
        [Modules.ORDER]: { order_id: order.medusaOrderId },
      })
    } catch {
      // Non-fatal: link may already exist from createOrderFromCart
    }

    return new StepResponse({
      id: order.id,
      printify_order_id: order.printifyOrderId,
      status: order.status,
      submitted_at: order.submittedAt,
      tracking: order.tracking,
    })
  },
)

// ── Workflow ────────────────────────────────────────────────────────

export const submitPrintifyOrderWorkflow = createWorkflow(
  "submit-printify-order",
  (input: SubmitInput) => {
    const validated = validateOrderStep(input)

    const submitted = submitToPrintifyStep({
      order_id: validated.order_id,
      store_id: validated.store_id,
      shipping_method: validated.shipping_method,
    })

    const result = updateOrderRecordStep({
      printify_order_id: submitted.printify_order_id,
      order_id: submitted.order_id,
    })

    return new WorkflowResponse(result)
  },
)
