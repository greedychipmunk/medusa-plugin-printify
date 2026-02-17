/**
 * Unit Tests: AutomationActivityStore
 */

import { automationActivityStore } from "../../../src/modules/printify/utils/automation-activity"

describe("AutomationActivityStore", () => {
  afterEach(() => {
    automationActivityStore.reset("config-1")
    automationActivityStore.reset("config-2")
  })

  // 1. Initializes with idle defaults
  it("should initialize with idle defaults", () => {
    const activity = automationActivityStore.get("config-1")

    expect(activity.configuration_id).toBe("config-1")
    expect(activity.product_sync.last_sync_status).toBe("idle")
    expect(activity.product_sync.products_synced).toBe(0)
    expect(activity.product_sync.products_failed).toBe(0)
    expect(activity.product_sync.last_sync_at).toBeUndefined()
    expect(activity.order_auto_submit.last_run_status).toBe("idle")
    expect(activity.order_auto_submit.orders_submitted).toBe(0)
    expect(activity.order_auto_submit.orders_failed).toBe(0)
  })

  // 2. Updates product sync activity
  it("should update product sync activity", () => {
    const now = new Date()
    automationActivityStore.updateProductSync("config-1", {
      last_sync_at: now,
      last_sync_status: "success",
      products_synced: 10,
      products_failed: 2,
    })

    const activity = automationActivityStore.get("config-1")
    expect(activity.product_sync.last_sync_status).toBe("success")
    expect(activity.product_sync.products_synced).toBe(10)
    expect(activity.product_sync.products_failed).toBe(2)
    expect(activity.product_sync.last_sync_at).toBe(now)
  })

  // 3. Updates order auto-submit activity
  it("should update order auto-submit activity", () => {
    automationActivityStore.updateOrderAutoSubmit("config-1", {
      last_run_at: new Date(),
      last_run_status: "failed",
      orders_submitted: 3,
      orders_failed: 1,
      error_message: "API timeout",
    })

    const activity = automationActivityStore.get("config-1")
    expect(activity.order_auto_submit.last_run_status).toBe("failed")
    expect(activity.order_auto_submit.orders_submitted).toBe(3)
    expect(activity.order_auto_submit.orders_failed).toBe(1)
    expect(activity.order_auto_submit.error_message).toBe("API timeout")
  })

  // 4. Resets activity to defaults
  it("should reset activity to defaults", () => {
    automationActivityStore.updateProductSync("config-1", {
      last_sync_status: "success",
      products_synced: 5,
    })

    automationActivityStore.reset("config-1")

    const activity = automationActivityStore.get("config-1")
    expect(activity.product_sync.last_sync_status).toBe("idle")
    expect(activity.product_sync.products_synced).toBe(0)
  })

  // 5. Maintains separate activities per config
  it("should maintain separate activities per config", () => {
    automationActivityStore.updateProductSync("config-1", {
      products_synced: 10,
    })
    automationActivityStore.updateProductSync("config-2", {
      products_synced: 20,
    })

    expect(automationActivityStore.get("config-1").product_sync.products_synced).toBe(10)
    expect(automationActivityStore.get("config-2").product_sync.products_synced).toBe(20)
  })
})
