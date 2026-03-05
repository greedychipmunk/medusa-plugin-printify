import syncProductsJob from "../../../src/jobs/sync-products-job"
import { syncProductsWorkflow } from "../../../src/workflows/sync-products"
import { PRINTIFY_MODULE } from "../../../src/modules/printify"

jest.mock("../../../src/workflows/sync-products", () => ({
  __esModule: true,
  syncProductsWorkflow: jest.fn(),
}))

const mockRun = jest.fn()

describe("sync-products-job", () => {
  let mockService: { getOptions: jest.Mock }
  let mockContainer: { resolve: jest.Mock }

  beforeEach(() => {
    mockRun.mockResolvedValue({ result: { synced: 5 } })
    ;(syncProductsWorkflow as unknown as jest.Mock).mockReturnValue({ run: mockRun })
    mockService = {
      getOptions: jest.fn().mockReturnValue({ shopId: "shop123" }),
    }
    mockContainer = {
      resolve: jest.fn().mockImplementation((key: string) => {
        if (key === PRINTIFY_MODULE) return mockService
        throw new Error(`Unknown key: ${key}`)
      }),
    }
  })

  it("runs syncProductsWorkflow with shopId from module options", async () => {
    await syncProductsJob(mockContainer as never)
    expect(mockRun).toHaveBeenCalledWith({ input: { shopId: "shop123" } })
  })

  it("skips when no shopId configured", async () => {
    mockService.getOptions.mockReturnValue({})
    await syncProductsJob(mockContainer as never)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it("exports correct cron schedule", async () => {
    const { config } = await import("../../../src/jobs/sync-products-job")
    expect(config.schedule).toBe("0 * * * *")
    expect(config.name).toBe("printify-sync-products")
  })
})
