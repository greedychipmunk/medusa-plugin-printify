/**
 * Unit Tests: Notification Emitter Utility
 */

import { emitNotification, parseNotificationEmails } from "../../../src/modules/printify/utils/notification-emitter"
import { PRINTIFY_EVENTS } from "../../../src/modules/printify/types/notification-events"

describe("parseNotificationEmails", () => {
  it("should parse comma-separated emails", () => {
    expect(parseNotificationEmails("a@b.com, c@d.com")).toEqual(["a@b.com", "c@d.com"])
  })

  it("should trim whitespace from emails", () => {
    expect(parseNotificationEmails("  a@b.com ,  c@d.com  ")).toEqual(["a@b.com", "c@d.com"])
  })

  it("should filter empty strings", () => {
    expect(parseNotificationEmails("a@b.com,,, ,c@d.com")).toEqual(["a@b.com", "c@d.com"])
  })

  it("should return empty array for null/undefined", () => {
    expect(parseNotificationEmails(null)).toEqual([])
    expect(parseNotificationEmails(undefined)).toEqual([])
    expect(parseNotificationEmails("")).toEqual([])
  })
})

describe("emitNotification", () => {
  let mockEmit: jest.Mock
  let mockContainer: any

  beforeEach(() => {
    mockEmit = jest.fn().mockResolvedValue(undefined)
    mockContainer = {
      resolve: jest.fn((key: string) => {
        if (key === "event_bus") return { emit: mockEmit }
        if (key === "logger") return { warn: jest.fn() }
        return null
      }),
    }
  })

  it("should emit when flag is enabled and emails are present", async () => {
    const config = {
      id: "config-1",
      notification_emails: "admin@test.com",
      notify_dead_lettered_orders: true,
    }

    await emitNotification(mockContainer, config, PRINTIFY_EVENTS.ORDER_DEAD_LETTERED, {
      order_id: "order-1",
      retry_count: 3,
      error_message: "Failed",
    })

    expect(mockEmit).toHaveBeenCalledWith(
      "printify.order.dead_lettered",
      expect.objectContaining({
        event_type: "printify.order.dead_lettered",
        configuration_id: "config-1",
        notification_emails: ["admin@test.com"],
        order_id: "order-1",
        retry_count: 3,
        error_message: "Failed",
        timestamp: expect.any(String),
      }),
    )
  })

  it("should skip when flag is disabled", async () => {
    const config = {
      id: "config-1",
      notification_emails: "admin@test.com",
      notify_dead_lettered_orders: false,
    }

    await emitNotification(mockContainer, config, PRINTIFY_EVENTS.ORDER_DEAD_LETTERED, {
      order_id: "order-1",
      retry_count: 3,
      error_message: "Failed",
    })

    expect(mockEmit).not.toHaveBeenCalled()
  })

  it("should skip when no emails configured", async () => {
    const config = {
      id: "config-1",
      notification_emails: null,
      notify_dead_lettered_orders: true,
    }

    await emitNotification(mockContainer, config, PRINTIFY_EVENTS.ORDER_DEAD_LETTERED, {
      order_id: "order-1",
      retry_count: 3,
      error_message: "Failed",
    })

    expect(mockEmit).not.toHaveBeenCalled()
  })

  it("should skip when config is null", async () => {
    await emitNotification(mockContainer, null, PRINTIFY_EVENTS.ORDER_DEAD_LETTERED, {
      order_id: "order-1",
      retry_count: 3,
      error_message: "Failed",
    })

    expect(mockEmit).not.toHaveBeenCalled()
  })

  it("should handle missing eventBus gracefully", async () => {
    const config = {
      id: "config-1",
      notification_emails: "admin@test.com",
      notify_dead_lettered_orders: true,
    }

    const container = {
      resolve: jest.fn((key: string) => {
        if (key === "event_bus") return null
        if (key === "logger") return { warn: jest.fn() }
        return null
      }),
    }

    await expect(
      emitNotification(container, config, PRINTIFY_EVENTS.ORDER_DEAD_LETTERED, {
        order_id: "order-1",
        retry_count: 3,
        error_message: "Failed",
      }),
    ).resolves.not.toThrow()
  })

  it("should emit correct payload for SYNC_FAILED", async () => {
    const config = {
      id: "config-1",
      notification_emails: "admin@test.com",
      notify_failed_syncs: true,
    }

    await emitNotification(mockContainer, config, PRINTIFY_EVENTS.SYNC_FAILED, {
      sync_duration_ms: 5000,
      error_message: "Network error",
    })

    expect(mockEmit).toHaveBeenCalledWith(
      "printify.sync.failed",
      expect.objectContaining({
        event_type: "printify.sync.failed",
        sync_duration_ms: 5000,
        error_message: "Network error",
      }),
    )
  })

  it("should emit correct payload for WEBHOOK_FAILED", async () => {
    const config = {
      id: "config-1",
      notification_emails: "admin@test.com",
      notify_webhook_errors: true,
    }

    await emitNotification(mockContainer, config, PRINTIFY_EVENTS.WEBHOOK_FAILED, {
      webhook_event_type: "order:status-changed",
      error_message: "DB down",
    })

    expect(mockEmit).toHaveBeenCalledWith(
      "printify.webhook.failed",
      expect.objectContaining({
        event_type: "printify.webhook.failed",
        webhook_event_type: "order:status-changed",
        error_message: "DB down",
      }),
    )
  })

  it("should parse multiple comma-separated emails into array", async () => {
    const config = {
      id: "config-1",
      notification_emails: "admin@test.com, ops@test.com, dev@test.com",
      notify_dead_lettered_orders: true,
    }

    await emitNotification(mockContainer, config, PRINTIFY_EVENTS.ORDER_DEAD_LETTERED, {
      order_id: "order-1",
      retry_count: 3,
      error_message: "Failed",
    })

    expect(mockEmit).toHaveBeenCalledWith(
      "printify.order.dead_lettered",
      expect.objectContaining({
        notification_emails: ["admin@test.com", "ops@test.com", "dev@test.com"],
      }),
    )
  })

  it("should not throw when eventBus.emit throws", async () => {
    mockEmit.mockRejectedValueOnce(new Error("Event bus broken"))
    const config = {
      id: "config-1",
      notification_emails: "admin@test.com",
      notify_dead_lettered_orders: true,
    }

    await expect(
      emitNotification(mockContainer, config, PRINTIFY_EVENTS.ORDER_DEAD_LETTERED, {
        order_id: "order-1",
        retry_count: 3,
        error_message: "Failed",
      }),
    ).resolves.not.toThrow()
  })
})
