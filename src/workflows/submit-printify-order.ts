import {
  createWorkflow,
  createStep,
  WorkflowResponse,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"

type SubmitPrintifyOrderInput = {
  localOrderId: string
  shopId: string
}

type SubmitPrintifyOrderOutput = {
  status: string
  printifyOrderId: string
}

const submitOrderStep = createStep(
  "printify-submit-order-step",
  async ({ localOrderId, shopId }: SubmitPrintifyOrderInput, { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)

    const orders = await service.listPrintifyOrders({ id: localOrderId })
    const localOrder = orders[0]

    if (!localOrder) {
      throw new Error(`PrintifyOrder not found: ${localOrderId}`)
    }
    if (!localOrder.printify_id) {
      throw new Error(`PrintifyOrder ${localOrderId} has no printify_id — cannot submit`)
    }

    const submitted = await service
      .getApiClient()
      .submitOrder(shopId, localOrder.printify_id as string)

    await service.updatePrintifyOrders(
      { id: localOrderId },
      { status: submitted.status, submitted_at: new Date() }
    )

    return new StepResponse({
      status: submitted.status,
      printifyOrderId: localOrder.printify_id as string,
    })
  }
)

export const submitPrintifyOrderWorkflow = createWorkflow(
  "submit-printify-order",
  (input: SubmitPrintifyOrderInput) => {
    const result = submitOrderStep(input)
    return new WorkflowResponse(result)
  }
)
