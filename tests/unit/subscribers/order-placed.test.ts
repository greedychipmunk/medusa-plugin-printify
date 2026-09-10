import orderPlacedHandler, { config } from "../../../src/subscribers/order-placed"
import { createPrintifyOrderWorkflow } from "../../../src/workflows/create-printify-order"
import { PRINTIFY_MODULE } from "../../../src/modules/printify"

jest.mock("../../../src/workflows/create-printify-order", () => ({
  __esModule: true,
  createPrintifyOrderWorkflow: jest.fn(),
}))

jest.mock("@medusajs/framework/utils", () => ({
  ...jest.requireActual("@medusajs/framework/utils"),
  Modules: { ...jest.requireActual("@medusajs/framework/utils").Modules, PRODUCT: "product" },
}))

const mockRun = jest.fn()

describe("order-placed subscriber", () => {
  let mockService: { getOptions: jest.Mock }
  let mockOrderService: { retrieveOrder: jest.Mock }
  let mockProductService: { listProductVariants: jest.Mock }
  let mockContainer: { resolve: jest.Mock }

  // Realistic Medusa v2 order: line items carry only variant_id.
  // Printify IDs live on variant metadata in the PRODUCT module —
  // the order module's items do not carry them.
  const mockOrder = {
    id: "order-1",
    email: "customer@example.com",
    items: [
      {
        variant_id: "variant-1",
        quantity: 2,
        metadata: {},
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
    jest.clearAllMocks()
    mockRun.mockResolvedValue({ result: { localOrderId: "l1", printifyOrderId: "po1" } })
    ;(createPrintifyOrderWorkflow as unknown as jest.Mock).mockReturnValue({ run: mockRun })

    mockService = {
      getOptions: jest.fn().mockReturnValue({ shopId: "shop1" }),
    }
    mockOrderService = {
      retrieveOrder: jest.fn().mockResolvedValue(mockOrder),
    }
    mockProductService = {
      listProductVariants: jest.fn().mockResolvedValue([
        {
          id: "variant-1",
          metadata: { printify_product_id: "pp1", printify_variant_id: 42 },
        },
      ]),
    }
    mockContainer = {
      resolve: jest.fn().mockImplementation((key: string) => {
        if (key === PRINTIFY_MODULE) return mockService
        if (key === "order") return mockOrderService
        if (key === "product") return mockProductService
        throw new Error(`Unknown service: ${key}`)
      }),
    }
  })

  it("subscribes to order.placed event", () => {
    expect(config.event).toBe("order.placed")
  })

  it("resolves Printify IDs from product-module variant metadata (production shape)", async () => {
    await orderPlacedHandler({
      event: { data: { id: "order-1" } },
      container: mockContainer as never,
    } as never)
    expect(mockProductService.listProductVariants).toHaveBeenCalledWith({
      id: ["variant-1"],
    })
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          medusaOrderId: "order-1",
          shopId: "shop1",
          shippingMethod: 1,
          lineItems: [
            expect.objectContaining({
              product_id: "pp1",
              variant_id: 42,
              quantity: 2,
            }),
          ],
        }),
      })
    )
  })

  it("still works with item-level metadata (explicit add-to-cart)", async () => {
    mockOrderService.retrieveOrder.mockResolvedValue({
      ...mockOrder,
      items: [
        {
          variant_id: "variant-x",
          quantity: 1,
          metadata: {
            printify_product_id: "pp2",
            printify_variant_id: 7,
          },
        },
      ],
    })
    await orderPlacedHandler({
      event: { data: { id: "order-1" } },
      container: mockContainer as never,
    } as never)
    expect(mockProductService.listProductVariants).not.toHaveBeenCalled()
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          lineItems: [
            expect.objectContaining({
              product_id: "pp2",
              variant_id: 7,
            }),
          ],
        }),
      })
    )
  })

  it("forwards only Printify items in a mixed order", async () => {
    mockProductService.listProductVariants.mockImplementation(
      ({ id }: { id: string[] }) => {
        if (id.includes("variant-1")) {
          return [
            {
              id: "variant-1",
              metadata: { printify_product_id: "pp1", printify_variant_id: 42 },
            },
          ]
        }
        return [{ id: id[0], metadata: {} }] // non-Printify variant
      }
    )
    mockOrderService.retrieveOrder.mockResolvedValue({
      ...mockOrder,
      items: [
        { variant_id: "variant-1", quantity: 2, metadata: {} },
        { variant_id: "variant-2", quantity: 1, metadata: {} },
      ],
    })
    await orderPlacedHandler({
      event: { data: { id: "order-1" } },
      container: mockContainer as never,
    } as never)
    expect(mockRun).toHaveBeenCalledTimes(1)
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          lineItems: [
            expect.objectContaining({ product_id: "pp1", variant_id: 42, quantity: 2 }),
          ],
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

  it("skips (with log) when order has no Printify items", async () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {})
    mockProductService.listProductVariants.mockResolvedValue([
      { id: "variant-1", metadata: {} },
    ])
    await orderPlacedHandler({
      event: { data: { id: "order-1" } },
      container: mockContainer as never,
    } as never)
    expect(mockRun).not.toHaveBeenCalled()
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("no Printify items")
    )
    infoSpy.mockRestore()
  })

  it("re-throws workflow failures so the event is not silently lost", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    mockRun.mockRejectedValue(new Error("Printify 500"))
    await expect(
      orderPlacedHandler({
        event: { data: { id: "order-1" } },
        container: mockContainer as never,
      } as never)
    ).rejects.toThrow("Printify 500")
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("FAILED"),
      expect.any(Error)
    )
    errorSpy.mockRestore()
  })
})
