import autoSubmitOrdersJob from "../../../src/jobs/auto-submit-orders-job"
import { submitPrintifyOrderWorkflow } from "../../../src/workflows/submit-printify-order"
import { PRINTIFY_MODULE } from "../../../src/modules/printify"

jest.mock("../../../src/workflows/submit-printify-order", () => ({
  __esModule: true,
  submitPrintifyOrderWorkflow: jest.fn(),
}))

const mockRun = jest.fn()

describe("auto-submit-orders-job", () => {
  let mockService: { getOptions: jest.Mock; listPrintifyOrders: jest.Mock }
  let mockContainer: { resolve: jest.Mock }

  beforeEach(() => {
    mockRun.mockResolvedValue({ result: { status: "in-production" } })
    ;(submitPrintifyOrderWorkflow as unknown as jest.Mock).mockReturnValue({ run: mockRun })
    mockService = {
      getOptions: jest.fn().mockReturnValue({ shopId: "shop1" }),
      listPrintifyOrders: jest.fn().mockResolvedValue([{ id: "local-order-1" }]),
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

  it("exports correct cron schedule", async () => {
    const { config } = await import("../../../src/jobs/auto-submit-orders-job")
    expect(config.schedule).toBe("*/5 * * * *")
    expect(config.name).toBe("printify-auto-submit-orders")
  })
})
