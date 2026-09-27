import autoSubmitOrdersJob from "../../../src/jobs/auto-submit-orders-job"
import { submitPrintifyOrderWorkflow } from "../../../src/workflows/submit-printify-order"
import { PRINTIFY_MODULE } from "../../../src/modules/printify"

jest.mock("../../../src/workflows/submit-printify-order", () => ({
  __esModule: true,
  submitPrintifyOrderWorkflow: jest.fn(),
}))

const mockRun = jest.fn()

describe("auto-submit-orders-job", () => {
  let mockService: {
    getOptions: jest.Mock
    listPrintifyOrders: jest.Mock
    getApiClient: jest.Mock
    updatePrintifyOrders: jest.Mock
  }
  let mockContainer: { resolve: jest.Mock }

  beforeEach(() => {
    mockRun.mockResolvedValue({ result: { status: "in-production" } })
    ;(submitPrintifyOrderWorkflow as unknown as jest.Mock).mockReturnValue({ run: mockRun })
    mockService = {
      getOptions: jest.fn().mockReturnValue({ shopId: "shop1" }),
      listPrintifyOrders: jest.fn().mockResolvedValue([{ id: "local-order-1" }]),
      getApiClient: jest.fn(),
      updatePrintifyOrders: jest.fn(),
    }
    mockContainer = {
      resolve: jest.fn().mockReturnValue(mockService),
    }
  })

  it("submits all pending orders", async () => {
    await autoSubmitOrdersJob(mockContainer as never)
    expect(mockRun).toHaveBeenCalledWith({
      input: { localOrderId: "local-order-1", shopId: "shop1" },
    })
  })

  it("skips when no shopId configured", async () => {
    mockService.getOptions.mockReturnValue({})
    await autoSubmitOrdersJob(mockContainer as never)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it("continues processing after a single order fails", async () => {
    mockService.listPrintifyOrders.mockResolvedValue([
      { id: "order-fail" },
      { id: "order-ok" },
    ])
    mockRun
      .mockRejectedValueOnce(new Error("Printify 500"))
      .mockResolvedValueOnce({ result: { status: "in-production" } })

    await autoSubmitOrdersJob(mockContainer as never)
    expect(mockRun).toHaveBeenCalledTimes(2)
  })

  it("syncs status from Printify on 8502 (order not submittable) instead of retrying forever", async () => {
    const getOrder = jest.fn().mockResolvedValue({ id: "p1", status: "canceled" })
    mockService.getApiClient.mockReturnValue({ getOrder })
    mockService.listPrintifyOrders.mockResolvedValue([
      { id: "stuck-order", printify_id: "printify-1" },
    ])
    mockRun.mockRejectedValue(
      new Error(
        `Printify API error 400: {"status":"error","code":8502,"message":"Operation failed.","errors":{"reason":"It is not allowed to sent order \\"26547087.1\\" to production with status canceled.","code":8502}}`
      )
    )

    await autoSubmitOrdersJob(mockContainer as never)

    expect(getOrder).toHaveBeenCalledWith("shop1", "printify-1")
    expect(mockService.updatePrintifyOrders).toHaveBeenCalledWith(
      { id: "stuck-order" },
      { status: "canceled" }
    )
  })

  it("does not treat 8502 as terminal when the order has no printify_id", async () => {
    mockService.listPrintifyOrders.mockResolvedValue([{ id: "no-remote-id" }])
    mockRun.mockRejectedValue(new Error(`Printify API error 400: {"code":8502}`))

    await autoSubmitOrdersJob(mockContainer as never)
    // falls through to the generic error log; no crash, no status sync attempted
    expect(mockRun).toHaveBeenCalledTimes(1)
  })

  it("exports correct cron schedule", async () => {
    const { config } = await import("../../../src/jobs/auto-submit-orders-job.js")
    expect(config.schedule).toBe("*/5 * * * *")
    expect(config.name).toBe("printify-auto-submit-orders")
  })
})
