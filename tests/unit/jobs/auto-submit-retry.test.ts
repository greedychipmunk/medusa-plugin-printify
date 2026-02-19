/**
 * Unit Tests: auto-submit-orders retry & dead-letter logic
 */

import { automationActivityStore } from "../../../src/modules/printify/utils/automation-activity"

const mockWorkflowRun = jest.fn()
jest.mock("../../../src/workflows/submit-printify-order", () => ({
  __esModule: true,
  submitPrintifyOrderWorkflow: jest.fn(),
}))

import autoSubmitOrdersJob from "../../../src/jobs/auto-submit-orders"
import { submitPrintifyOrderWorkflow } from "../../../src/workflows/submit-printify-order"

const mockUpdateOrders = jest.fn().mockResolvedValue([{}])

function buildContainer(configs: any[] = [], orders: any[] = []) {
  const mockService = {
    listAndCountPrintifyConfigurations: jest.fn().mockResolvedValue([configs, configs.length]),
    listOrdersFiltered: jest.fn().mockResolvedValue({ orders, total: orders.length, hasMore: false }),
    updatePrintifyOrders: mockUpdateOrders,
  }
  return {
    resolve: jest.fn((key: string) => {
      if (key === "logger") {
        return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      }
      return mockService
    }),
  } as any
}

function buildOrder(id: string, configId: string = "config-1", retryCount: number = 0, lastErrorAt?: Date) {
  // Default to far past so existing tests always pass backoff check
  const errorAt = lastErrorAt ?? (retryCount > 0 ? new Date("2020-01-01T00:00:00Z") : null)
  return {
    id,
    status: "pending",
    entity: { configuration_id: configId, retry_count: retryCount, last_error_at: errorAt },
    configuration_id: configId,
    retry_count: retryCount,
    last_error_at: errorAt,
  }
}

describe("auto-submit-orders retry & dead-letter", () => {
  beforeEach(() => {
    ;(submitPrintifyOrderWorkflow as jest.Mock).mockReturnValue({ run: mockWorkflowRun })
    mockUpdateOrders.mockClear()
  })

  afterEach(() => {
    jest.clearAllMocks()
    automationActivityStore.reset("config-1")
  })

  // 1. Increments retry_count on submission failure
  it("should increment retry_count on submission failure", async () => {
    mockWorkflowRun.mockRejectedValueOnce(new Error("API timeout"))

    const container = buildContainer(
      [{ id: "config-1", auto_submit_orders: true, store_id: "store-1" }],
      [buildOrder("order-1", "config-1", 0)],
    )

    await autoSubmitOrdersJob(container)

    expect(mockUpdateOrders).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "order-1",
        retry_count: 1,
      }),
    ])
  })

  // 2. Writes error_details and last_error_at on failure
  it("should write error_details and last_error_at on failure", async () => {
    mockWorkflowRun.mockRejectedValueOnce(new Error("Rate limit exceeded"))

    const container = buildContainer(
      [{ id: "config-1", auto_submit_orders: true, store_id: "store-1" }],
      [buildOrder("order-1", "config-1", 0)],
    )

    await autoSubmitOrdersJob(container)

    expect(mockUpdateOrders).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "order-1",
        error_details: "Rate limit exceeded",
        last_error_at: expect.any(Date),
      }),
    ])
  })

  // 3. Moves order to FAILED after max_order_retries exceeded
  it("should move order to FAILED after max_order_retries exceeded", async () => {
    mockWorkflowRun.mockRejectedValueOnce(new Error("Permanent failure"))

    const container = buildContainer(
      [{ id: "config-1", auto_submit_orders: true, store_id: "store-1" }],
      [buildOrder("order-1", "config-1", 2)], // retry_count=2, next will be 3 >= default max_order_retries
    )

    await autoSubmitOrdersJob(container)

    expect(mockUpdateOrders).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "order-1",
        status: "failed",
        retry_count: 3,
        error_details: "Permanent failure",
      }),
    ])
  })

  // 4. Does not retry FAILED orders (excluded from query by status filter)
  it("should only query PENDING orders, excluding FAILED", async () => {
    mockWorkflowRun.mockResolvedValue({ result: {} })

    const container = buildContainer(
      [{ id: "config-1", auto_submit_orders: true, store_id: "store-1" }],
      [buildOrder("order-1", "config-1")], // only PENDING orders returned
    )

    await autoSubmitOrdersJob(container)

    const mockService = container.resolve("printify") as any
    expect(mockService.listOrdersFiltered).toHaveBeenCalledWith({
      status: ["pending"],
    })
  })

  // 5. Resets retry_count on successful submission
  it("should reset retry_count on successful submission", async () => {
    mockWorkflowRun.mockResolvedValueOnce({ result: {} })

    const container = buildContainer(
      [{ id: "config-1", auto_submit_orders: true, store_id: "store-1" }],
      [buildOrder("order-1", "config-1", 2)], // had previous failures
    )

    await autoSubmitOrdersJob(container)

    expect(mockUpdateOrders).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "order-1",
        retry_count: 0,
        error_details: null,
        last_error_at: null,
      }),
    ])
  })

  // 6. Skips orders still in backoff window
  it("should skip orders still in backoff window", async () => {
    mockWorkflowRun.mockResolvedValue({ result: {} })

    const container = buildContainer(
      [{ id: "config-1", auto_submit_orders: true, store_id: "store-1" }],
      [buildOrder("order-1", "config-1", 1, new Date())], // last_error_at = now → in backoff
    )

    await autoSubmitOrdersJob(container)

    // Order should be skipped entirely — no workflow call, no update
    expect(mockWorkflowRun).not.toHaveBeenCalled()
    expect(mockUpdateOrders).not.toHaveBeenCalled()
  })

  // 7. Retries orders past backoff window
  it("should retry orders past backoff window", async () => {
    mockWorkflowRun.mockResolvedValue({ result: {} })

    const container = buildContainer(
      [{ id: "config-1", auto_submit_orders: true, store_id: "store-1" }],
      // retry_count=1, base=5min → delay=5min. Last error 10 min ago → ready
      [buildOrder("order-1", "config-1", 1, new Date(Date.now() - 10 * 60 * 1000))],
    )

    await autoSubmitOrdersJob(container)

    expect(mockWorkflowRun).toHaveBeenCalledTimes(1)
  })

  // 8. Tracks orders_dead_lettered in activity store
  it("should track orders_dead_lettered in activity store", async () => {
    mockWorkflowRun.mockRejectedValueOnce(new Error("Final failure"))

    const container = buildContainer(
      [{ id: "config-1", auto_submit_orders: true, store_id: "store-1" }],
      [buildOrder("order-1", "config-1", 2)], // will exceed default max_order_retries
    )

    await autoSubmitOrdersJob(container)

    const activity = automationActivityStore.get("config-1")
    expect(activity.order_auto_submit.orders_dead_lettered).toBe(1)
    expect(activity.order_auto_submit.orders_failed).toBe(1)
  })
})
