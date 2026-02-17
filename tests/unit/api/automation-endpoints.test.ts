/**
 * Unit Tests: Automation Admin Endpoints
 *
 * Tests for GET /admin/printify/automation/status
 * and PUT /admin/printify/automation/toggle
 */

import { automationActivityStore } from "../../../src/modules/printify/utils/automation-activity"
import { GET } from "../../../src/api/admin/printify/automation/status/route"
import { PUT } from "../../../src/api/admin/printify/automation/toggle/route"

function buildMockService(config: any = null) {
  return {
    getConfigurationByStoreId: jest.fn().mockResolvedValue(config),
    updatePrintifyConfigurations: jest.fn().mockResolvedValue([config]),
  }
}

const DEFAULT_CONFIG = {
  id: "config-1",
  store_id: "default-store",
  sync_enabled: true,
  sync_frequency: 60,
  auto_submit_orders: false,
}

function buildReq(body: any = {}, service: any = buildMockService()): any {
  return {
    body,
    auth_context: { actor_id: "default-store" },
    scope: { resolve: jest.fn().mockReturnValue(service) },
  }
}

function buildRes(): any {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
}

describe("Automation Admin Endpoints", () => {
  afterEach(() => {
    jest.clearAllMocks()
    automationActivityStore.reset("config-1")
  })

  // 1. GET status returns automation activity
  it("GET should return automation activity", async () => {
    automationActivityStore.updateProductSync("config-1", {
      last_sync_status: "success",
      products_synced: 10,
    })

    const service = buildMockService(DEFAULT_CONFIG)
    const req = buildReq({}, service)
    const res = buildRes()

    await GET(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const data = res.json.mock.calls[0][0]
    expect(data.success).toBe(true)
    expect(data.data.configuration.sync_enabled).toBe(true)
    expect(data.data.configuration.auto_submit_orders).toBe(false)
    expect(data.data.product_sync.last_sync_status).toBe("success")
    expect(data.data.product_sync.products_synced).toBe(10)
  })

  // 2. GET status returns 404 when no config
  it("GET should return 404 when no config", async () => {
    const service = buildMockService(null)
    const req = buildReq({}, service)
    const res = buildRes()

    await GET(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Configuration not found" }),
    )
  })

  // 3. PUT toggle updates sync_enabled
  it("PUT should update sync_enabled", async () => {
    const service = buildMockService(DEFAULT_CONFIG)
    const req = buildReq({ sync_enabled: false }, service)
    const res = buildRes()

    await PUT(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(service.updatePrintifyConfigurations).toHaveBeenCalledWith([
      expect.objectContaining({ id: "config-1", sync_enabled: false }),
    ])
    const data = res.json.mock.calls[0][0]
    expect(data.success).toBe(true)
    expect(data.data.sync_enabled).toBe(false)
  })

  // 4. PUT toggle updates auto_submit_orders
  it("PUT should update auto_submit_orders", async () => {
    const service = buildMockService(DEFAULT_CONFIG)
    const req = buildReq({ auto_submit_orders: true }, service)
    const res = buildRes()

    await PUT(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(service.updatePrintifyConfigurations).toHaveBeenCalledWith([
      expect.objectContaining({ id: "config-1", auto_submit_orders: true }),
    ])
    const data = res.json.mock.calls[0][0]
    expect(data.success).toBe(true)
    expect(data.data.auto_submit_orders).toBe(true)
  })

  // 5. PUT toggle returns 400 for invalid body
  it("PUT should return 400 for invalid body", async () => {
    const service = buildMockService(DEFAULT_CONFIG)
    const req = buildReq({}, service) // no toggle fields
    const res = buildRes()

    await PUT(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Validation error" }),
    )
  })

  // 6. PUT toggle returns 404 when no config
  it("PUT should return 404 when no config", async () => {
    const service = buildMockService(null)
    const req = buildReq({ sync_enabled: true }, service)
    const res = buildRes()

    await PUT(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Configuration not found" }),
    )
  })
})
