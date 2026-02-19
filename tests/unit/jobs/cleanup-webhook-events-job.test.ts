/**
 * Unit Tests: cleanup-webhook-events scheduled job
 */

import cleanupWebhookEventsJob, { config } from "../../../src/jobs/cleanup-webhook-events"

function buildContainer(configs: any[] = [], cleanupResult: number = 0) {
  const mockService = {
    listAndCountPrintifyConfigurations: jest.fn().mockResolvedValue([configs, configs.length]),
    cleanupOldWebhookEvents: jest.fn().mockResolvedValue(cleanupResult),
  }
  return {
    resolve: jest.fn((key: string) => {
      if (key === "logger") {
        return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      }
      return mockService
    }),
    _mockService: mockService,
  } as any
}

describe("cleanup-webhook-events job", () => {
  it("should export correct job config with daily 2am schedule", () => {
    expect(config.name).toBe("cleanup-webhook-events")
    expect(config.schedule).toBe("0 2 * * *")
  })

  it("should skip when no configurations found", async () => {
    const container = buildContainer([])
    await cleanupWebhookEventsJob(container)

    const mockService = container._mockService
    expect(mockService.cleanupOldWebhookEvents).not.toHaveBeenCalled()
  })

  it("should iterate configs and call cleanup for each", async () => {
    const container = buildContainer(
      [{ id: "config-1" }, { id: "config-2" }],
      5,
    )
    await cleanupWebhookEventsJob(container)

    const mockService = container._mockService
    expect(mockService.cleanupOldWebhookEvents).toHaveBeenCalledTimes(2)
    expect(mockService.cleanupOldWebhookEvents).toHaveBeenCalledWith("config-1")
    expect(mockService.cleanupOldWebhookEvents).toHaveBeenCalledWith("config-2")
  })

  it("should handle per-config errors without stopping", async () => {
    const mockService = {
      listAndCountPrintifyConfigurations: jest.fn().mockResolvedValue([
        [{ id: "config-1" }, { id: "config-2" }],
        2,
      ]),
      cleanupOldWebhookEvents: jest.fn()
        .mockRejectedValueOnce(new Error("DB error"))
        .mockResolvedValueOnce(3),
    }
    const container = {
      resolve: jest.fn((key: string) => {
        if (key === "logger") {
          return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        }
        return mockService
      }),
    } as any

    await cleanupWebhookEventsJob(container)

    // Should still attempt the second config
    expect(mockService.cleanupOldWebhookEvents).toHaveBeenCalledTimes(2)
  })

  it("should handle top-level job failure", async () => {
    const container = {
      resolve: jest.fn((key: string) => {
        if (key === "logger") {
          return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        }
        return {
          listAndCountPrintifyConfigurations: jest.fn().mockRejectedValue(
            new Error("Connection lost"),
          ),
        }
      }),
    } as any

    // Should not throw
    await expect(cleanupWebhookEventsJob(container)).resolves.toBeUndefined()
  })
})
