import reconcileOrdersJob, { config } from "../../../src/jobs/reconcile-orders-job"
import { createPrintifyOrderWorkflow } from "../../../src/workflows/create-printify-order"
import { PRINTIFY_MODULE } from "../../../src/modules/printify"

jest.mock("../../../src/workflows/create-printify-order", () => ({
  __esModule: true,
  createPrintifyOrderWorkflow: jest.fn(),
}))

const mockRun = jest.fn()

const makeOrder = (id: string, items: unknown[]) => ({
  id,
  email: "customer@example.com",
  items,
  shipping_methods: [{ data: { printify_shipping_method: 1 } }],
  shipping_address: {
    first_name: "Jane",
    last_name: "Doe",
    email: "jane@example.com",
    phone: "555-0100",
    address_1: "1 Main St",
    address_2: null,
    city: "San Francisco",
    province: "CA",
    postal_code: "94105",
    country_code: "US",
  },
})

const printifyItem = (qty: number) => ({
  quantity: qty,
  metadata: {},
  variant: {
    id: "variant-1",
    metadata: { printify_product_id: "pp1", printify_variant_id: 42 },
  },
})

const nonPrintifyItem = () => ({
  quantity: 1,
  metadata: {},
  variant: { id: "variant-2", metadata: {} },
})

describe("reconcile-orders-job", () => {
  let mockService: {
    getOptions: jest.Mock
    listPrintifyOrders: jest.Mock
  }
  let mockOrderService: { listOrders: jest.Mock }
  let mockContainer: { resolve: jest.Mock }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.PRINTIFY_DRY_RUN = "false"
    mockRun.mockResolvedValue({ result: { localOrderId: "l1", printifyOrderId: "po1" } })
    ;(createPrintifyOrderWorkflow as unknown as jest.Mock).mockReturnValue({ run: mockRun })

    mockService = {
      getOptions: jest.fn().mockReturnValue({ shopId: "shop1" }),
      listPrintifyOrders: jest.fn().mockResolvedValue([]),
    }
    mockOrderService = {
      listOrders: jest.fn().mockResolvedValue([]),
    }
    mockContainer = {
      resolve: jest.fn().mockImplementation((key: string) => {
        if (key === PRINTIFY_MODULE) return mockService
        if (key === "order") return mockOrderService
        throw new Error(`Unknown service: ${key}`)
      }),
    }
  })

  afterEach(() => {
    delete process.env.PRINTIFY_DRY_RUN
  })

  it("runs every 15 minutes", () => {
    expect(config.name).toBe("printify-reconcile-orders")
    expect(config.schedule).toBe("*/15 * * * *")
  })

  it("creates Printify orders for recent orders missing from the local table", async () => {
    mockOrderService.listOrders.mockResolvedValue([
      makeOrder("order-1", [printifyItem(2)]),
    ])
    await reconcileOrdersJob(mockContainer as never)
    expect(mockRun).toHaveBeenCalledTimes(1)
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          medusaOrderId: "order-1",
          shopId: "shop1",
          lineItems: [
            expect.objectContaining({ product_id: "pp1", variant_id: 42, quantity: 2 }),
          ],
        }),
      })
    )
  })

  it("skips orders already present in the local printify_orders table", async () => {
    mockOrderService.listOrders.mockResolvedValue([
      makeOrder("order-1", [printifyItem(1)]),
    ])
    mockService.listPrintifyOrders.mockResolvedValue([{ id: "local-1" }])
    await reconcileOrdersJob(mockContainer as never)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it("skips orders with no Printify items", async () => {
    mockOrderService.listOrders.mockResolvedValue([
      makeOrder("order-1", [nonPrintifyItem()]),
    ])
    await reconcileOrdersJob(mockContainer as never)
    expect(mockRun).not.toHaveBeenCalled()
    expect(mockService.listPrintifyOrders).not.toHaveBeenCalled()
  })

  it("continues after a failed order and reconciles the next one", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    mockRun
      .mockRejectedValueOnce(new Error("Printify 500"))
      .mockResolvedValueOnce({ result: {} })
    mockOrderService.listOrders.mockResolvedValue([
      makeOrder("order-1", [printifyItem(1)]),
      makeOrder("order-2", [printifyItem(1)]),
    ])
    await reconcileOrdersJob(mockContainer as never)
    expect(mockRun).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("order-1"),
      expect.any(Error)
    )
    errorSpy.mockRestore()
  })

  it("skips entirely when no shopId configured", async () => {
    mockService.getOptions.mockReturnValue({})
    await reconcileOrdersJob(mockContainer as never)
    expect(mockOrderService.listOrders).not.toHaveBeenCalled()
  })

  it("skips entirely in dry-run mode", async () => {
    process.env.PRINTIFY_DRY_RUN = "true"
    await reconcileOrdersJob(mockContainer as never)
    expect(mockOrderService.listOrders).not.toHaveBeenCalled()
    expect(mockRun).not.toHaveBeenCalled()
  })
})
