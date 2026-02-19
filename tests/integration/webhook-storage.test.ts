/**
 * Integration Tests: Webhook Event Storage & Replay
 *
 * Exercises real business logic through the service layer with
 * in-memory stores. Covers storage, listing, filtering, cleanup,
 * and replay round-trip.
 */

import { createTestService, TestServiceContext } from "./helpers/test-service-factory"

let ctx: TestServiceContext

beforeEach(() => {
  ctx = createTestService()
})

describe("Webhook Event Storage", () => {
  it("should store a webhook event with all fields", async () => {
    const { service, stores } = ctx

    // Create a config first
    stores.configurations.create([{
      id: "config-1",
      store_id: "store-1",
      printify_api_key: "pk_test",
      printify_shop_id: "shop-1",
      webhook_secret: "secret",
      webhook_retention_days: 30,
    }])

    const result = await service.storeWebhookEvent({
      configuration_id: "config-1",
      event_type: "order:shipped",
      payload: { type: "order:shipped", resource: { data: { id: "ord-1" } } },
      signature: "sig123",
      processing_status: "success",
      processing_error: null,
      received_at: new Date(),
      processed_at: new Date(),
    })

    expect(result.id).toBeDefined()
    expect(result.event_type).toBe("order:shipped")
    expect(result.processing_status).toBe("success")
    expect(stores.webhook_events.store.size).toBe(1)
  })

  it("should store a failed event with error details", async () => {
    const { service } = ctx

    const result = await service.storeWebhookEvent({
      configuration_id: "config-1",
      event_type: "order:status-changed",
      payload: { type: "order:status-changed" },
      processing_status: "failed",
      processing_error: "Order not found",
      received_at: new Date(),
    })

    expect(result.processing_status).toBe("failed")
    expect(result.processing_error).toBe("Order not found")
  })
})

describe("Webhook Event Listing & Filtering", () => {
  beforeEach(() => {
    const { stores } = ctx
    const now = new Date()

    stores.webhook_events.create([
      {
        id: "evt-1",
        configuration_id: "config-1",
        event_type: "order:shipped",
        processing_status: "success",
        payload: {},
        signature: "sig1",
        received_at: new Date(now.getTime() - 3600_000),
        processed_at: new Date(now.getTime() - 3600_000),
      },
      {
        id: "evt-2",
        configuration_id: "config-1",
        event_type: "order:status-changed",
        processing_status: "failed",
        processing_error: "Handler error",
        payload: {},
        signature: "sig2",
        received_at: new Date(now.getTime() - 1800_000),
        processed_at: new Date(now.getTime() - 1800_000),
      },
      {
        id: "evt-3",
        configuration_id: "config-2",
        event_type: "product:updated",
        processing_status: "success",
        payload: {},
        signature: null,
        received_at: now,
        processed_at: now,
      },
    ])
  })

  it("should list all events with pagination", async () => {
    const { service } = ctx

    const result = await service.listWebhookEventsFiltered({ limit: 2, offset: 0 })

    expect(result.events.length).toBe(2)
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(true)
  })

  it("should filter by event_type", async () => {
    const { service } = ctx

    const result = await service.listWebhookEventsFiltered({
      event_type: "order:shipped",
    })

    expect(result.events.length).toBe(1)
    expect(result.events[0].event_type).toBe("order:shipped")
  })

  it("should filter by processing_status", async () => {
    const { service } = ctx

    const result = await service.listWebhookEventsFiltered({
      processing_status: "failed",
    })

    expect(result.events.length).toBe(1)
    expect(result.events[0].processing_error).toBe("Handler error")
  })
})

describe("Webhook Event Cleanup", () => {
  it("should delete events older than retention period", async () => {
    const { service, stores } = ctx
    const now = new Date()

    stores.configurations.create([{
      id: "config-1",
      store_id: "store-1",
      printify_api_key: "pk_test",
      printify_shop_id: "shop-1",
      webhook_retention_days: 7,
    }])

    // Event from 10 days ago (should be deleted)
    stores.webhook_events.create([
      {
        id: "old-evt",
        configuration_id: "config-1",
        event_type: "order:shipped",
        processing_status: "success",
        payload: {},
        received_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      },
      {
        id: "new-evt",
        configuration_id: "config-1",
        event_type: "order:shipped",
        processing_status: "success",
        payload: {},
        received_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
    ])

    const deleted = await service.cleanupOldWebhookEvents("config-1")

    expect(deleted).toBe(1)
    expect(stores.webhook_events.store.size).toBe(1)
    expect(stores.webhook_events.store.has("new-evt")).toBe(true)
  })

  it("should return 0 when no events to clean up", async () => {
    const { service, stores } = ctx

    stores.configurations.create([{
      id: "config-1",
      store_id: "store-1",
      printify_api_key: "pk_test",
      printify_shop_id: "shop-1",
      webhook_retention_days: 30,
    }])

    const deleted = await service.cleanupOldWebhookEvents("config-1")
    expect(deleted).toBe(0)
  })
})

describe("Webhook Event Replay", () => {
  it("should replay an event and update status to replayed", async () => {
    const { service, stores } = ctx

    stores.configurations.create([{
      id: "config-1",
      store_id: "store-1",
      printify_api_key: "pk_test",
      printify_shop_id: "shop-1",
      webhook_secret: null,
    }])

    stores.webhook_events.create([{
      id: "evt-1",
      configuration_id: "config-1",
      event_type: "order:shipped",
      processing_status: "failed",
      payload: { type: "order:shipped", resource: { data: { id: "ord-1" } } },
      signature: null,
      received_at: new Date(),
    }])

    const mockDispatch = jest.fn().mockResolvedValue(undefined)

    const result = await service.replayWebhookEvent("evt-1", mockDispatch)

    expect(result.success).toBe(true)
    expect(mockDispatch).toHaveBeenCalledWith(
      service,
      { type: "order:shipped", resource: { data: { id: "ord-1" } } },
      expect.objectContaining({ id: "config-1" }),
    )

    const updated = stores.webhook_events.retrieve("evt-1")
    expect(updated.processing_status).toBe("replayed")
    expect(updated.processed_at).toBeDefined()
  })

  it("should mark as failed when dispatch throws", async () => {
    const { service, stores } = ctx

    stores.configurations.create([{
      id: "config-1",
      store_id: "store-1",
      printify_api_key: "pk_test",
      printify_shop_id: "shop-1",
      webhook_secret: null,
    }])

    stores.webhook_events.create([{
      id: "evt-1",
      configuration_id: "config-1",
      event_type: "order:shipped",
      processing_status: "success",
      payload: { type: "order:shipped" },
      signature: null,
      received_at: new Date(),
    }])

    const mockDispatch = jest.fn().mockRejectedValue(new Error("Handler crash"))

    const result = await service.replayWebhookEvent("evt-1", mockDispatch)

    expect(result.success).toBe(false)
    expect(result.error).toBe("Handler crash")

    const updated = stores.webhook_events.retrieve("evt-1")
    expect(updated.processing_status).toBe("failed")
    expect(updated.processing_error).toBe("Handler crash")
  })
})
