/**
 * Unit Tests: POST /admin/printify/webhook-events/:id/replay
 */

import { POST } from "../../../src/api/admin/printify/webhook-events/[id]/replay/route"

// Mock the dispatchEvent import
jest.mock("../../../src/api/webhooks/printify/route", () => ({
  __esModule: true,
  dispatchEvent: jest.fn(),
}))

function buildMockService(overrides: Record<string, any> = {}) {
  return {
    replayWebhookEvent: jest.fn().mockResolvedValue({ success: true }),
    ...overrides,
  }
}

function buildReq(eventId: string, service: any): any {
  return {
    params: { id: eventId },
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

describe("POST /admin/printify/webhook-events/:id/replay", () => {
  it("should replay event successfully", async () => {
    const service = buildMockService()
    const req = buildReq("evt-1", service)
    const res = buildRes()

    await POST(req, res)

    expect(service.replayWebhookEvent).toHaveBeenCalledWith("evt-1", expect.any(Function))
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Webhook event replayed successfully",
        data: { event_id: "evt-1", status: "replayed" },
      }),
    )
  })

  it("should return 422 on signature verification failure", async () => {
    const service = buildMockService({
      replayWebhookEvent: jest.fn().mockResolvedValue({
        success: false,
        error: "Signature re-verification failed",
      }),
    })
    const req = buildReq("evt-1", service)
    const res = buildRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(422)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "Signature verification failed",
      }),
    )
  })

  it("should return 404 for non-existent event", async () => {
    const service = buildMockService({
      replayWebhookEvent: jest.fn().mockRejectedValue(
        new Error("Entity not found: evt-999"),
      ),
    })
    const req = buildReq("evt-999", service)
    const res = buildRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Webhook event not found" }),
    )
  })

  it("should return 500 when dispatch fails", async () => {
    const service = buildMockService({
      replayWebhookEvent: jest.fn().mockResolvedValue({
        success: false,
        error: "Handler threw an exception",
      }),
    })
    const req = buildReq("evt-1", service)
    const res = buildRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "Replay failed",
        message: "Handler threw an exception",
      }),
    )
  })

  it("should handle missing event ID", async () => {
    const service = buildMockService()
    const req = buildReq("", service)
    req.params.id = ""
    const res = buildRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("should handle server errors gracefully", async () => {
    const service = buildMockService({
      replayWebhookEvent: jest.fn().mockRejectedValue(new Error("Unexpected DB error")),
    })
    const req = buildReq("evt-1", service)
    const res = buildRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
  })
})
