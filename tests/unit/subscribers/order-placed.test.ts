import orderPlacedHandler, { config } from "../../../src/subscribers/order-placed"
import { createPrintifyOrderWorkflow } from "../../../src/workflows/create-printify-order"
import { PRINTIFY_MODULE } from "../../../src/modules/printify"

jest.mock("../../../src/workflows/create-printify-order", () => ({
  __esModule: true,
  createPrintifyOrderWorkflow: jest.fn(),
}))

const mockRun = jest.fn()

describe("order-placed subscriber", () => {
  let mockService: { getOptions: jest.Mock }
  let mockOrderService: { retrieveOrder: jest.Mock }
  let mockContainer: { resolve: jest.Mock }

  const mockOrder = {
    id: "order-1",
    email: "customer@example.com",
    items: [
      {
        quantity: 2,
        metadata: {
          printify_product_id: "pp1",
          printify_variant_id: 42,
        },
      },
    ],
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
  }

  beforeEach(() => {
    mockRun.mockResolvedValue({ result: { localOrderId: "l1", printifyOrderId: "po1" } })
    ;(createPrintifyOrderWorkflow as unknown as jest.Mock).mockReturnValue({ run: mockRun })

    mockService = {
      getOptions: jest.fn().mockReturnValue({ shopId: "shop1" }),
    }
    mockOrderService = {
      retrieveOrder: jest.fn().mockResolvedValue(mockOrder),
    }
    mockContainer = {
      resolve: jest.fn().mockImplementation((key: string) => {
        if (key === PRINTIFY_MODULE) return mockService
        if (key === "order") return mockOrderService
        throw new Error(`Unknown service: ${key}`)
      }),
    }
  })

  it("subscribes to order.placed event", () => {
    expect(config.event).toBe("order.placed")
  })

  it("calls createPrintifyOrderWorkflow when order has Printify items", async () => {
    await orderPlacedHandler({
      event: { data: { id: "order-1" } },
      container: mockContainer as never,
    } as never)
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          medusaOrderId: "order-1",
          shopId: "shop1",
          shippingMethod: 1,
        }),
      })
    )
  })

  it("skips when no shopId configured", async () => {
    mockService.getOptions.mockReturnValue({})
    await orderPlacedHandler({
      event: { data: { id: "order-1" } },
      container: mockContainer as never,
    } as never)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it("skips when order has no Printify items", async () => {
    mockOrderService.retrieveOrder.mockResolvedValue({
      ...mockOrder,
      items: [{ quantity: 1, metadata: {} }],
    })
    await orderPlacedHandler({
      event: { data: { id: "order-1" } },
      container: mockContainer as never,
    } as never)
    expect(mockRun).not.toHaveBeenCalled()
  })
})
