/**
 * Integration Tests: Scheduled Jobs
 *
 * Tests sync-printify-products and auto-submit-orders job handlers
 * with real PrintifyModuleService (in-memory stores) + mocked workflows.
 * Validates config filtering, sync frequency, activity tracking,
 * retry counting, and dead-letter queue behavior end-to-end.
 */

jest.mock("axios", () => ({
  __esModule: true,
  default: { create: jest.fn() },
}))

jest.mock("@medusajs/framework/utils", () => {
  const modelChain = {
    primaryKey: () => modelChain,
    unique: () => modelChain,
    nullable: () => modelChain,
    default: () => modelChain,
  }
  return {
    MedusaService: () => class MockBase {},
    Modules: { PRODUCT: "productService", ORDER: "orderService" },
    ContainerRegistrationKeys: { QUERY: "query" },
    model: {
      define: jest.fn().mockReturnValue({}),
      id: () => modelChain,
      text: () => modelChain,
      number: () => modelChain,
      boolean: () => modelChain,
      json: () => modelChain,
      dateTime: () => modelChain,
    },
    Module: jest.fn(),
    defineConfig: jest.fn(),
  }
})

// Mock workflows — we test job orchestration logic, not workflow internals
const mockSyncRun = jest.fn()
jest.mock("../../src/workflows/sync-printify-products", () => ({
  __esModule: true,
  syncPrintifyProductsWorkflow: jest.fn(),
}))

const mockSubmitRun = jest.fn()
jest.mock("../../src/workflows/submit-printify-order", () => ({
  __esModule: true,
  submitPrintifyOrderWorkflow: jest.fn(),
}))

import { createTestService, TestServiceContext } from "./helpers/test-service-factory"
import { automationActivityStore } from "../../src/modules/printify/utils/automation-activity"
import syncPrintifyProductsJob from "../../src/jobs/sync-printify-products"
import autoSubmitOrdersJob from "../../src/jobs/auto-submit-orders"
import { syncPrintifyProductsWorkflow } from "../../src/workflows/sync-printify-products"
import { submitPrintifyOrderWorkflow } from "../../src/workflows/submit-printify-order"

// ── Helpers ────────────────────────────────────────────────────────

function buildContainer(ctx: TestServiceContext) {
  return {
    resolve: (key: string) => {
      if (key === "logger") {
        return ctx.mockContainer.logger
      }
      return ctx.service
    },
  } as any
}

// ── sync-printify-products ─────────────────────────────────────────

describe("Integration: sync-printify-products job", () => {
  let ctx: TestServiceContext

  beforeEach(() => {
    ctx = createTestService()
    ;(syncPrintifyProductsWorkflow as jest.Mock).mockReturnValue({ run: mockSyncRun })
  })

  afterEach(() => {
    automationActivityStore.reset("config_sync")
    automationActivityStore.reset("config_nosync")
  })

  it("runs sync for configs with sync_enabled=true, skips others", async () => {
    ctx.stores.configurations.create([
      { id: "config_sync", store_id: "s1", sync_enabled: true, sync_frequency: 60, printify_api_key: "k", printify_shop_id: "sh" },
      { id: "config_nosync", store_id: "s2", sync_enabled: false, sync_frequency: 60, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    mockSyncRun.mockResolvedValue({
      result: { synced_count: 3, failed_count: 1, skipped_count: 0 },
    })

    await syncPrintifyProductsJob(buildContainer(ctx))

    expect(mockSyncRun).toHaveBeenCalledTimes(1)
    expect(mockSyncRun).toHaveBeenCalledWith({
      input: { config_id: "config_sync", force: false },
    })

    const activity = automationActivityStore.get("config_sync")
    expect(activity.product_sync.last_sync_status).toBe("success")
    expect(activity.product_sync.products_synced).toBe(3)
    expect(activity.product_sync.products_failed).toBe(1)
  })

  it("skips sync when frequency has not elapsed", async () => {
    ctx.stores.configurations.create([
      { id: "config_sync", store_id: "s1", sync_enabled: true, sync_frequency: 60, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    // Mark last sync as very recent
    automationActivityStore.updateProductSync("config_sync", {
      last_sync_at: new Date(),
      last_sync_status: "success",
    })

    await syncPrintifyProductsJob(buildContainer(ctx))

    expect(mockSyncRun).not.toHaveBeenCalled()
  })

  it("runs sync when frequency has elapsed", async () => {
    ctx.stores.configurations.create([
      { id: "config_sync", store_id: "s1", sync_enabled: true, sync_frequency: 1, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    // Last sync was 2 hours ago, frequency is 1 minute
    automationActivityStore.updateProductSync("config_sync", {
      last_sync_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
      last_sync_status: "success",
    })

    mockSyncRun.mockResolvedValue({
      result: { synced_count: 1, failed_count: 0, skipped_count: 0 },
    })

    await syncPrintifyProductsJob(buildContainer(ctx))

    expect(mockSyncRun).toHaveBeenCalledTimes(1)
  })

  it("skips config when sync is already running", async () => {
    ctx.stores.configurations.create([
      { id: "config_sync", store_id: "s1", sync_enabled: true, sync_frequency: 60, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    automationActivityStore.updateProductSync("config_sync", {
      last_sync_status: "running",
    })

    await syncPrintifyProductsJob(buildContainer(ctx))

    expect(mockSyncRun).not.toHaveBeenCalled()
  })

  it("records failure in activity store when workflow throws", async () => {
    ctx.stores.configurations.create([
      { id: "config_sync", store_id: "s1", sync_enabled: true, sync_frequency: 60, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    mockSyncRun.mockRejectedValue(new Error("Printify API unreachable"))

    await syncPrintifyProductsJob(buildContainer(ctx))

    const activity = automationActivityStore.get("config_sync")
    expect(activity.product_sync.last_sync_status).toBe("failed")
    expect(activity.product_sync.error_message).toBe("Printify API unreachable")
  })

  it("handles multiple configs independently", async () => {
    ctx.stores.configurations.create([
      { id: "cfg_a", store_id: "s1", sync_enabled: true, sync_frequency: 60, printify_api_key: "k", printify_shop_id: "sh" },
      { id: "cfg_b", store_id: "s2", sync_enabled: true, sync_frequency: 60, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    mockSyncRun
      .mockResolvedValueOnce({ result: { synced_count: 5, failed_count: 0, skipped_count: 0 } })
      .mockRejectedValueOnce(new Error("Timeout"))

    await syncPrintifyProductsJob(buildContainer(ctx))

    expect(mockSyncRun).toHaveBeenCalledTimes(2)

    const activityA = automationActivityStore.get("cfg_a")
    expect(activityA.product_sync.last_sync_status).toBe("success")
    expect(activityA.product_sync.products_synced).toBe(5)

    const activityB = automationActivityStore.get("cfg_b")
    expect(activityB.product_sync.last_sync_status).toBe("failed")
    expect(activityB.product_sync.error_message).toBe("Timeout")
  })
})

// ── auto-submit-orders ─────────────────────────────────────────────

describe("Integration: auto-submit-orders job", () => {
  let ctx: TestServiceContext

  beforeEach(() => {
    ctx = createTestService()
    ;(submitPrintifyOrderWorkflow as jest.Mock).mockReturnValue({ run: mockSubmitRun })
  })

  afterEach(() => {
    automationActivityStore.reset("config_auto")
    automationActivityStore.reset("config_manual")
  })

  it("submits pending orders for configs with auto_submit_orders=true", async () => {
    ctx.stores.configurations.create([
      { id: "config_auto", store_id: "s1", auto_submit_orders: true, printify_api_key: "k", printify_shop_id: "sh" },
      { id: "config_manual", store_id: "s2", auto_submit_orders: false, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    // Create pending orders for config_auto
    ctx.stores.orders.create([
      { id: "ord_1", medusa_order_id: "med_1", status: "pending", configuration_id: "config_auto", total_price: 2000, line_items: [], shipping_address: {}, retry_count: 0 },
      { id: "ord_2", medusa_order_id: "med_2", status: "pending", configuration_id: "config_auto", total_price: 3000, line_items: [], shipping_address: {}, retry_count: 0 },
    ])

    mockSubmitRun.mockResolvedValue({ result: {} })

    await autoSubmitOrdersJob(buildContainer(ctx))

    expect(mockSubmitRun).toHaveBeenCalledTimes(2)

    const activity = automationActivityStore.get("config_auto")
    expect(activity.order_auto_submit.last_run_status).toBe("success")
    expect(activity.order_auto_submit.orders_submitted).toBe(2)
    expect(activity.order_auto_submit.orders_failed).toBe(0)
  })

  it("skips configs without auto_submit_orders", async () => {
    ctx.stores.configurations.create([
      { id: "config_manual", store_id: "s1", auto_submit_orders: false, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    await autoSubmitOrdersJob(buildContainer(ctx))

    expect(mockSubmitRun).not.toHaveBeenCalled()
  })

  it("skips when already running", async () => {
    ctx.stores.configurations.create([
      { id: "config_auto", store_id: "s1", auto_submit_orders: true, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    automationActivityStore.updateOrderAutoSubmit("config_auto", {
      last_run_status: "running",
    })

    await autoSubmitOrdersJob(buildContainer(ctx))

    expect(mockSubmitRun).not.toHaveBeenCalled()
  })

  it("increments retry_count on failure and persists error details", async () => {
    ctx.stores.configurations.create([
      { id: "config_auto", store_id: "s1", auto_submit_orders: true, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    ctx.stores.orders.create([
      { id: "ord_retry", medusa_order_id: "med_r", status: "pending", configuration_id: "config_auto", total_price: 1000, line_items: [], shipping_address: {}, retry_count: 0 },
    ])

    mockSubmitRun.mockRejectedValue(new Error("Connection refused"))

    await autoSubmitOrdersJob(buildContainer(ctx))

    const order = ctx.stores.orders.retrieve("ord_retry")
    expect(order.retry_count).toBe(1)
    expect(order.error_details).toBe("Connection refused")
    expect(order.last_error_at).toBeDefined()
    expect(order.status).toBe("pending") // still pending, not dead-lettered

    const activity = automationActivityStore.get("config_auto")
    expect(activity.order_auto_submit.orders_failed).toBe(1)
    expect(activity.order_auto_submit.orders_dead_lettered).toBe(0)
  })

  it("dead-letters order after 3 consecutive failures", async () => {
    ctx.stores.configurations.create([
      { id: "config_auto", store_id: "s1", auto_submit_orders: true, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    ctx.stores.orders.create([
      { id: "ord_dlq", medusa_order_id: "med_dlq", status: "pending", configuration_id: "config_auto", total_price: 5000, line_items: [], shipping_address: {}, retry_count: 2 },
    ])

    mockSubmitRun.mockRejectedValue(new Error("API 500"))

    await autoSubmitOrdersJob(buildContainer(ctx))

    const order = ctx.stores.orders.retrieve("ord_dlq")
    expect(order.retry_count).toBe(3)
    expect(order.status).toBe("failed")
    expect(order.error_details).toBe("API 500")

    const activity = automationActivityStore.get("config_auto")
    expect(activity.order_auto_submit.orders_dead_lettered).toBe(1)
  })

  it("respects custom max_order_retries from configuration", async () => {
    ctx.stores.configurations.create([
      { id: "config_auto", store_id: "s1", auto_submit_orders: true, max_order_retries: 5, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    // retry_count=4: would dead-letter at default (3), but config allows 5
    ctx.stores.orders.create([
      { id: "ord_custom", medusa_order_id: "med_custom", status: "pending", configuration_id: "config_auto", total_price: 2000, line_items: [], shipping_address: {}, retry_count: 4 },
    ])

    mockSubmitRun.mockRejectedValue(new Error("Transient error"))

    await autoSubmitOrdersJob(buildContainer(ctx))

    const order = ctx.stores.orders.retrieve("ord_custom")
    expect(order.retry_count).toBe(5)
    expect(order.status).toBe("failed") // 5 >= max_order_retries(5) → dead-lettered
    expect(order.error_details).toBe("Transient error")
  })

  it("keeps order pending when retry_count below custom max_order_retries", async () => {
    ctx.stores.configurations.create([
      { id: "config_auto", store_id: "s1", auto_submit_orders: true, max_order_retries: 5, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    // retry_count=3: would dead-letter at default (3), but config allows 5
    ctx.stores.orders.create([
      { id: "ord_still_ok", medusa_order_id: "med_still_ok", status: "pending", configuration_id: "config_auto", total_price: 2000, line_items: [], shipping_address: {}, retry_count: 3 },
    ])

    mockSubmitRun.mockRejectedValue(new Error("Transient error"))

    await autoSubmitOrdersJob(buildContainer(ctx))

    const order = ctx.stores.orders.retrieve("ord_still_ok")
    expect(order.retry_count).toBe(4)
    expect(order.status).toBe("pending") // 4 < 5, still retryable
  })

  it("resets retry_count to 0 on successful submission", async () => {
    ctx.stores.configurations.create([
      { id: "config_auto", store_id: "s1", auto_submit_orders: true, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    ctx.stores.orders.create([
      { id: "ord_reset", medusa_order_id: "med_reset", status: "pending", configuration_id: "config_auto", total_price: 2000, line_items: [], shipping_address: {}, retry_count: 2 },
    ])

    mockSubmitRun.mockResolvedValue({ result: {} })

    await autoSubmitOrdersJob(buildContainer(ctx))

    const order = ctx.stores.orders.retrieve("ord_reset")
    expect(order.retry_count).toBe(0)
    expect(order.error_details).toBeNull()
  })

  it("handles mixed success and failure across orders", async () => {
    ctx.stores.configurations.create([
      { id: "config_auto", store_id: "s1", auto_submit_orders: true, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    ctx.stores.orders.create([
      { id: "ord_ok", medusa_order_id: "med_ok", status: "pending", configuration_id: "config_auto", total_price: 1000, line_items: [], shipping_address: {}, retry_count: 0 },
      { id: "ord_fail", medusa_order_id: "med_fail", status: "pending", configuration_id: "config_auto", total_price: 2000, line_items: [], shipping_address: {}, retry_count: 0 },
      { id: "ord_dlq2", medusa_order_id: "med_dlq2", status: "pending", configuration_id: "config_auto", total_price: 3000, line_items: [], shipping_address: {}, retry_count: 2 },
    ])

    mockSubmitRun
      .mockResolvedValueOnce({ result: {} }) // ord_ok succeeds
      .mockRejectedValueOnce(new Error("Timeout")) // ord_fail fails (retry 1)
      .mockRejectedValueOnce(new Error("Timeout again")) // ord_dlq2 fails (retry 3 → dead-letter)

    await autoSubmitOrdersJob(buildContainer(ctx))

    const okOrder = ctx.stores.orders.retrieve("ord_ok")
    expect(okOrder.status).toBe("pending") // unchanged by job (workflow handles status)

    const failOrder = ctx.stores.orders.retrieve("ord_fail")
    expect(failOrder.retry_count).toBe(1)
    expect(failOrder.status).toBe("pending")

    const dlqOrder = ctx.stores.orders.retrieve("ord_dlq2")
    expect(dlqOrder.retry_count).toBe(3)
    expect(dlqOrder.status).toBe("failed")

    const activity = automationActivityStore.get("config_auto")
    expect(activity.order_auto_submit.orders_submitted).toBe(1)
    expect(activity.order_auto_submit.orders_failed).toBe(2)
    expect(activity.order_auto_submit.orders_dead_lettered).toBe(1)
  })

  it("skips orders still in backoff window during auto-submit", async () => {
    ctx.stores.configurations.create([
      { id: "config_auto", store_id: "s1", auto_submit_orders: true, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    ctx.stores.orders.create([
      // retry_count=1, last_error_at = just now → in backoff (needs 5 min)
      { id: "ord_backoff", medusa_order_id: "med_bo", status: "pending", configuration_id: "config_auto", total_price: 1000, line_items: [], shipping_address: {}, retry_count: 1, last_error_at: new Date() },
      // retry_count=0 → always ready
      { id: "ord_fresh", medusa_order_id: "med_fresh", status: "pending", configuration_id: "config_auto", total_price: 2000, line_items: [], shipping_address: {}, retry_count: 0 },
    ])

    mockSubmitRun.mockResolvedValue({ result: {} })

    await autoSubmitOrdersJob(buildContainer(ctx))

    // Only the fresh order should be submitted
    expect(mockSubmitRun).toHaveBeenCalledTimes(1)

    const activity = automationActivityStore.get("config_auto")
    expect(activity.order_auto_submit.orders_submitted).toBe(1)
  })

  it("records job-level failure in activity store", async () => {
    ctx.stores.configurations.create([
      { id: "config_auto", store_id: "s1", auto_submit_orders: true, printify_api_key: "k", printify_shop_id: "sh" },
    ])

    // Force listOrdersFiltered to throw by breaking the underlying store method
    const original = (ctx.service as any).listAndCountPrintifyOrders
    ;(ctx.service as any).listAndCountPrintifyOrders = () => {
      throw new Error("DB connection lost")
    }

    await autoSubmitOrdersJob(buildContainer(ctx))

    const activity = automationActivityStore.get("config_auto")
    expect(activity.order_auto_submit.last_run_status).toBe("failed")
    expect(activity.order_auto_submit.error_message).toBe("DB connection lost")

    // Restore
    ;(ctx.service as any).listAndCountPrintifyOrders = original
  })
})
