/**
 * Unit Tests: Webhook Event Admin Endpoints
 *
 * Tests GET list (filters, pagination, omits payload),
 * GET detail (full payload), and DELETE.
 */

import { GET } from "../../../src/api/admin/printify/webhook-events/route"
import { GET as GET_DETAIL, DELETE } from "../../../src/api/admin/printify/webhook-events/[id]/route"

function buildMockService(overrides: Record<string, any> = {}) {
  return {
    listWebhookEventsFiltered: jest.fn().mockResolvedValue({
      events: [
        {
          id: "evt-1",
          event_type: "order:shipped",
          processing_status: "success",
          received_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
          configuration_id: "config-1",
          payload: { type: "order:shipped", resource: {} },
          signature: "abc123",
        },
      ],
      total: 1,
      hasMore: false,
    }),
    retrievePrintifyWebhookEvent: jest.fn().mockResolvedValue({
      id: "evt-1",
      event_type: "order:shipped",
      processing_status: "success",
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      configuration_id: "config-1",
      payload: { type: "order:shipped", resource: { data: { id: "ord-1" } } },
      signature: "abc123",
    }),
    deletePrintifyWebhookEvents: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function buildReq(service: any, query: Record<string, string> = {}, params: Record<string, string> = {}): any {
  return {
    query,
    params,
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

describe("GET /admin/printify/webhook-events", () => {
  it("should return events list without payload/signature", async () => {
    const service = buildMockService()
    const req = buildReq(service)
    const res = buildRes()

    await GET(req, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          events: expect.arrayContaining([
            expect.not.objectContaining({ payload: expect.anything() }),
          ]),
          total: 1,
        }),
      }),
    )
    // Verify payload and signature are stripped
    const responseData = res.json.mock.calls[0][0].data.events[0]
    expect(responseData.payload).toBeUndefined()
    expect(responseData.signature).toBeUndefined()
    expect(responseData.event_type).toBe("order:shipped")
  })

  it("should pass filter params to service", async () => {
    const service = buildMockService()
    const req = buildReq(service, {
      event_type: "order:shipped",
      processing_status: "failed",
      limit: "10",
      offset: "5",
    })
    const res = buildRes()

    await GET(req, res)

    expect(service.listWebhookEventsFiltered).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "order:shipped",
        processing_status: "failed",
        limit: 10,
        offset: 5,
      }),
    )
  })

  it("should pass date range filters", async () => {
    const service = buildMockService()
    const req = buildReq(service, {
      received_after: "2026-01-01T00:00:00Z",
      received_before: "2026-02-01T00:00:00Z",
    })
    const res = buildRes()

    await GET(req, res)

    expect(service.listWebhookEventsFiltered).toHaveBeenCalledWith(
      expect.objectContaining({
        received_after: expect.any(Date),
        received_before: expect.any(Date),
      }),
    )
  })

  it("should handle empty results", async () => {
    const service = buildMockService({
      listWebhookEventsFiltered: jest.fn().mockResolvedValue({
        events: [],
        total: 0,
        hasMore: false,
      }),
    })
    const req = buildReq(service)
    const res = buildRes()

    await GET(req, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { events: [], total: 0, hasMore: false },
      }),
    )
  })
})

describe("GET /admin/printify/webhook-events/:id", () => {
  it("should return full event detail including payload", async () => {
    const service = buildMockService()
    const req = buildReq(service, {}, { id: "evt-1" })
    const res = buildRes()

    await GET_DETAIL(req, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          event: expect.objectContaining({
            id: "evt-1",
            payload: expect.any(Object),
            signature: "abc123",
          }),
        }),
      }),
    )
  })

  it("should return 404 for non-existent event", async () => {
    const service = buildMockService({
      retrievePrintifyWebhookEvent: jest.fn().mockRejectedValue(
        new Error("Entity not found: evt-999"),
      ),
    })
    const req = buildReq(service, {}, { id: "evt-999" })
    const res = buildRes()

    await GET_DETAIL(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Webhook event not found" }),
    )
  })
})

describe("DELETE /admin/printify/webhook-events/:id", () => {
  it("should delete an event", async () => {
    const service = buildMockService()
    const req = buildReq(service, {}, { id: "evt-1" })
    const res = buildRes()

    await DELETE(req, res)

    expect(service.deletePrintifyWebhookEvents).toHaveBeenCalledWith(["evt-1"])
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    )
  })

  it("should return 404 when deleting non-existent event", async () => {
    const service = buildMockService({
      retrievePrintifyWebhookEvent: jest.fn().mockRejectedValue(
        new Error("Entity not found: evt-999"),
      ),
    })
    const req = buildReq(service, {}, { id: "evt-999" })
    const res = buildRes()

    await DELETE(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(service.deletePrintifyWebhookEvents).not.toHaveBeenCalled()
  })

  it("should handle server errors", async () => {
    const service = buildMockService({
      retrievePrintifyWebhookEvent: jest.fn().mockResolvedValue({ id: "evt-1" }),
      deletePrintifyWebhookEvents: jest.fn().mockRejectedValue(new Error("DB error")),
    })
    const req = buildReq(service, {}, { id: "evt-1" })
    const res = buildRes()

    await DELETE(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
  })
})
