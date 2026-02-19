/**
 * Unit Tests: auto-submit-orders scheduled job
 */

import { automationActivityStore } from "../../../src/modules/printify/utils/automation-activity"

// Mock the workflow
const mockWorkflowRun = jest.fn()
jest.mock("../../../src/workflows/submit-printify-order", () => ({
  __esModule: true,
  submitPrintifyOrderWorkflow: jest.fn(),
}))

// Mock notification emitter
const mockEmitNotification = jest.fn().mockResolvedValue(undefined)
jest.mock("../../../src/modules/printify/utils/notification-emitter", () => ({
  __esModule: true,
  emitNotification: (...args: any[]) => mockEmitNotification(...args),
}))

import autoSubmitOrdersJob, { config } from "../../../src/jobs/auto-submit-orders"
import { submitPrintifyOrderWorkflow } from "../../../src/workflows/submit-printify-order"

function buildContainer(configs: any[] = [], orders: any[] = []) {
  const mockService = {
    listAndCountPrintifyConfigurations: jest.fn().mockResolvedValue([configs, configs.length]),
    listOrdersFiltered: jest.fn().mockResolvedValue({ orders, total: orders.length, hasMore: false }),
    updatePrintifyOrders: jest.fn().mockResolvedValue([{}]),
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

function buildOrder(id: string, configId: string = "default") {
  return {
    id,
    status: "pending",
    entity: { configuration_id: configId },
    configuration_id: configId,
  }
}

describe("auto-submit-orders job", () => {
  beforeEach(() => {
    ;(submitPrintifyOrderWorkflow as jest.Mock).mockReturnValue({ run: mockWorkflowRun })
    mockEmitNotification.mockClear()
  })

  afterEach(() => {
    jest.clearAllMocks()
    automationActivityStore.reset("config-1")
  })

  // 1. Exports correct job config
  it("should export correct job config", () => {
    expect(config.name).toBe("auto-submit-orders")
    expect(config.schedule).toBe("*/5 * * * *")
  })

  // 2. Skips when no configs with auto_submit_orders
  it("should skip when no configs with auto_submit_orders", async () => {
    const container = buildContainer([])
    await autoSubmitOrdersJob(container)
    expect(mockWorkflowRun).not.toHaveBeenCalled()
  })

  // 3. Auto-submits pending orders
  it("should auto-submit pending orders", async () => {
    mockWorkflowRun.mockResolvedValue({ result: {} })

    const container = buildContainer(
      [{ id: "config-1", auto_submit_orders: true, store_id: "store-1" }],
      [buildOrder("order-1", "config-1"), buildOrder("order-2", "config-1")],
    )

    await autoSubmitOrdersJob(container)

    expect(mockWorkflowRun).toHaveBeenCalledTimes(2)
    const activity = automationActivityStore.get("config-1")
    expect(activity.order_auto_submit.last_run_status).toBe("success")
    expect(activity.order_auto_submit.orders_submitted).toBe(2)
    expect(activity.order_auto_submit.orders_failed).toBe(0)
  })

  // 4. Handles mixed success/failure gracefully
  it("should handle mixed success/failure gracefully", async () => {
    mockWorkflowRun
      .mockResolvedValueOnce({ result: {} })
      .mockRejectedValueOnce(new Error("Printify API error"))

    const container = buildContainer(
      [{ id: "config-1", auto_submit_orders: true, store_id: "store-1" }],
      [buildOrder("order-1", "config-1"), buildOrder("order-2", "config-1")],
    )

    await autoSubmitOrdersJob(container)

    const activity = automationActivityStore.get("config-1")
    expect(activity.order_auto_submit.last_run_status).toBe("success")
    expect(activity.order_auto_submit.orders_submitted).toBe(1)
    expect(activity.order_auto_submit.orders_failed).toBe(1)
  })

  // 5. Emits notification on dead-letter
  it("should emit notification when order is dead-lettered", async () => {
    mockWorkflowRun.mockRejectedValueOnce(new Error("Permanent failure"))

    const config = {
      id: "config-1",
      auto_submit_orders: true,
      store_id: "store-1",
      notification_emails: "admin@test.com",
      notify_dead_lettered_orders: true,
    }

    const container = buildContainer(
      [config],
      [{ id: "order-1", status: "pending", entity: { configuration_id: "config-1", retry_count: 2, last_error_at: new Date("2020-01-01") }, configuration_id: "config-1", retry_count: 2, last_error_at: new Date("2020-01-01") }],
    )

    await autoSubmitOrdersJob(container)

    expect(mockEmitNotification).toHaveBeenCalledWith(
      container,
      config,
      "printify.order.dead_lettered",
      expect.objectContaining({
        order_id: "order-1",
        retry_count: 3,
        error_message: "Permanent failure",
      }),
    )
  })

  // 6. Skips notification when flag disabled
  it("should not emit notification when notify_dead_lettered_orders is false", async () => {
    mockWorkflowRun.mockResolvedValue({ result: {} })

    const container = buildContainer(
      [{ id: "config-1", auto_submit_orders: true, store_id: "store-1", notify_dead_lettered_orders: false }],
      [buildOrder("order-1", "config-1")],
    )

    await autoSubmitOrdersJob(container)

    // No dead-letter happened, so no notification regardless
    expect(mockEmitNotification).not.toHaveBeenCalled()
  })

  // 7. Updates activity on job failure
  it("should update activity on job failure", async () => {
    const mockService = {
      listAndCountPrintifyConfigurations: jest.fn().mockResolvedValue([
        [{ id: "config-1", auto_submit_orders: true, store_id: "store-1" }],
        1,
      ]),
      listOrdersFiltered: jest.fn().mockRejectedValue(new Error("DB connection lost")),
    }

    const container = {
      resolve: jest.fn((key: string) => {
        if (key === "logger") {
          return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        }
        return mockService
      }),
    } as any

    await autoSubmitOrdersJob(container)

    const activity = automationActivityStore.get("config-1")
    expect(activity.order_auto_submit.last_run_status).toBe("failed")
    expect(activity.order_auto_submit.error_message).toBe("DB connection lost")
  })
})
