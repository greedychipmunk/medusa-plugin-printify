/**
 * Unit Tests: Notification Config Endpoints
 *
 * Tests that the config API endpoints properly handle notification fields.
 */

import { GET, POST, PUT } from "../../../src/api/admin/printify/config/route"

function buildMockService(overrides: Record<string, any> = {}) {
  return {
    getConfigurationByStoreId: jest.fn().mockResolvedValue(null),
    createOrUpdateConfiguration: jest.fn().mockResolvedValue({
      id: "config-1",
      store_id: "default-store",
      printify_shop_id: "shop-1",
      sync_enabled: true,
      sync_frequency: 60,
      auto_submit_orders: false,
      notification_emails: "admin@test.com",
      notify_dead_lettered_orders: true,
      notify_failed_syncs: true,
      notify_webhook_errors: false,
      created_at: new Date(),
      updated_at: new Date(),
    }),
    ...overrides,
  }
}

function buildReqRes(body: any, service: any) {
  const req: any = {
    auth_context: { actor_id: "default-store" },
    body,
    scope: {
      resolve: jest.fn().mockReturnValue(service),
    },
  }
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
  return { req, res }
}

describe("Notification Config Endpoints", () => {
  // 1. GET returns notification fields
  it("GET should return notification fields", async () => {
    const service = buildMockService({
      getConfigurationByStoreId: jest.fn().mockResolvedValue({
        id: "config-1",
        store_id: "default-store",
        printify_shop_id: "shop-1",
        printify_api_key: "pk_test",
        sync_enabled: true,
        sync_frequency: 60,
        auto_submit_orders: false,
        notification_emails: "admin@test.com, ops@test.com",
        notify_dead_lettered_orders: true,
        notify_failed_syncs: false,
        notify_webhook_errors: true,
        webhook_secret: null,
        created_at: new Date(),
        updated_at: new Date(),
      }),
    })

    const { req, res } = buildReqRes({}, service)
    await GET(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const responseData = res.json.mock.calls[0][0].data
    expect(responseData.notification_emails).toBe("admin@test.com, ops@test.com")
    expect(responseData.notify_dead_lettered_orders).toBe(true)
    expect(responseData.notify_failed_syncs).toBe(false)
    expect(responseData.notify_webhook_errors).toBe(true)
  })

  // 2. POST accepts notification fields
  it("POST should accept notification fields", async () => {
    const service = buildMockService()
    const body = {
      printify_api_key: "pk_test",
      printify_shop_id: "shop-1",
      notification_emails: "admin@test.com",
      notify_dead_lettered_orders: true,
      notify_failed_syncs: false,
      notify_webhook_errors: true,
    }

    const { req, res } = buildReqRes(body, service)
    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(service.createOrUpdateConfiguration).toHaveBeenCalledWith(
      "default-store",
      expect.objectContaining({
        notification_emails: "admin@test.com",
        notify_dead_lettered_orders: true,
        notify_failed_syncs: false,
        notify_webhook_errors: true,
      }),
    )
  })

  // 3. PUT updates notification settings
  it("PUT should update notification settings", async () => {
    const existingConfig = {
      id: "config-1",
      store_id: "default-store",
      printify_api_key: "pk_test",
      printify_shop_id: "shop-1",
      sync_enabled: true,
      sync_frequency: 60,
      auto_submit_orders: false,
      notification_emails: "old@test.com",
      notify_dead_lettered_orders: true,
      notify_failed_syncs: true,
      notify_webhook_errors: true,
      webhook_secret: null,
    }

    const service = buildMockService({
      getConfigurationByStoreId: jest.fn().mockResolvedValue(existingConfig),
    })

    const body = {
      notification_emails: "new@test.com",
      notify_webhook_errors: false,
    }

    const { req, res } = buildReqRes(body, service)
    await PUT(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(service.createOrUpdateConfiguration).toHaveBeenCalledWith(
      "default-store",
      expect.objectContaining({
        notification_emails: "new@test.com",
        notify_webhook_errors: false,
      }),
    )
  })

  // 4. POST response includes notification fields
  it("POST response should include notification fields", async () => {
    const service = buildMockService()
    const body = {
      printify_api_key: "pk_test",
      printify_shop_id: "shop-1",
    }

    const { req, res } = buildReqRes(body, service)
    await POST(req, res)

    const responseData = res.json.mock.calls[0][0].data
    expect(responseData).toHaveProperty("notification_emails")
    expect(responseData).toHaveProperty("notify_dead_lettered_orders")
    expect(responseData).toHaveProperty("notify_failed_syncs")
    expect(responseData).toHaveProperty("notify_webhook_errors")
  })
})
