/**
 * Unit Tests: sync-printify-products scheduled job
 */

import { automationActivityStore } from "../../../src/modules/printify/utils/automation-activity"

// Mock the workflow
const mockWorkflowRun = jest.fn()
jest.mock("../../../src/workflows/sync-printify-products", () => ({
  __esModule: true,
  syncPrintifyProductsWorkflow: jest.fn(),
}))

import syncPrintifyProductsJob, { config } from "../../../src/jobs/sync-printify-products"
import { syncPrintifyProductsWorkflow } from "../../../src/workflows/sync-printify-products"

function buildContainer(configs: any[] = []) {
  const mockService = {
    listAndCountPrintifyConfigurations: jest.fn().mockResolvedValue([configs, configs.length]),
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

describe("sync-printify-products job", () => {
  beforeEach(() => {
    ;(syncPrintifyProductsWorkflow as jest.Mock).mockReturnValue({ run: mockWorkflowRun })
  })

  afterEach(() => {
    jest.clearAllMocks()
    automationActivityStore.reset("config-1")
  })

  // 1. Exports correct job config
  it("should export correct job config", () => {
    expect(config.name).toBe("sync-printify-products")
    expect(config.schedule).toBe("*/5 * * * *")
  })

  // 2. Skips when no configs with sync_enabled
  it("should skip when no configs with sync_enabled", async () => {
    const container = buildContainer([])
    await syncPrintifyProductsJob(container)
    expect(mockWorkflowRun).not.toHaveBeenCalled()
  })

  // 3. Runs sync for enabled configuration
  it("should run sync for enabled configuration", async () => {
    mockWorkflowRun.mockResolvedValue({
      result: { synced_count: 5, failed_count: 0, skipped_count: 1 },
    })

    const container = buildContainer([
      { id: "config-1", sync_enabled: true, sync_frequency: 60, store_id: "store-1" },
    ])

    await syncPrintifyProductsJob(container)

    expect(mockWorkflowRun).toHaveBeenCalledWith({
      input: { config_id: "config-1", force: false },
    })

    const activity = automationActivityStore.get("config-1")
    expect(activity.product_sync.last_sync_status).toBe("success")
    expect(activity.product_sync.products_synced).toBe(5)
  })

  // 4. Respects sync_frequency and skips recent syncs
  it("should skip when sync_frequency has not elapsed", async () => {
    // Set last sync to just now
    automationActivityStore.updateProductSync("config-1", {
      last_sync_at: new Date(),
      last_sync_status: "success",
    })

    const container = buildContainer([
      { id: "config-1", sync_enabled: true, sync_frequency: 60, store_id: "store-1" },
    ])

    await syncPrintifyProductsJob(container)

    expect(mockWorkflowRun).not.toHaveBeenCalled()
  })

  // 5. Updates activity on sync failure
  it("should update activity on sync failure", async () => {
    mockWorkflowRun.mockRejectedValue(new Error("Network error"))

    const container = buildContainer([
      { id: "config-1", sync_enabled: true, sync_frequency: 60, store_id: "store-1" },
    ])

    await syncPrintifyProductsJob(container)

    const activity = automationActivityStore.get("config-1")
    expect(activity.product_sync.last_sync_status).toBe("failed")
    expect(activity.product_sync.error_message).toBe("Network error")
  })
})
