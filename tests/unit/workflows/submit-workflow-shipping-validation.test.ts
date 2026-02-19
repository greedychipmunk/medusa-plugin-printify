/**
 * Unit Tests: Shipping Method Validation
 *
 * Tests validateShippingMethod() used by both the workflow and service layer.
 */

jest.mock("@medusajs/framework/utils", () => ({
  MedusaService: () => class MockBase {},
  model: {
    define: jest.fn().mockReturnValue({}),
    id: jest.fn().mockReturnValue({ primaryKey: jest.fn() }),
    text: jest.fn().mockReturnValue({ nullable: jest.fn(), unique: jest.fn(), default: jest.fn() }),
    boolean: jest.fn().mockReturnValue({ default: jest.fn() }),
    number: jest.fn().mockReturnValue({ default: jest.fn() }),
    json: jest.fn().mockReturnValue({ nullable: jest.fn() }),
    dateTime: jest.fn().mockReturnValue({ nullable: jest.fn() }),
  },
  Module: jest.fn(),
}))

import { validateShippingMethod } from "../../../src/modules/printify/utils/order-utils"
import { shippingRateCache } from "../../../src/modules/printify/utils/shipping-cache"
import { PrintifyOrderBridge } from "../../../src/modules/printify/utils/dml-bridge"

describe("validateShippingMethod", () => {
  let mockApiClient: any
  let mockOrder: PrintifyOrderBridge

  const shippingOptions = [
    { id: 1, name: "Standard", cost: 500 },
    { id: 2, name: "Express", cost: 1200 },
    { id: 3, name: "Priority", cost: 1800 },
  ]

  beforeEach(() => {
    shippingRateCache.clear()

    mockApiClient = {
      calculateShipping: jest.fn().mockResolvedValue(shippingOptions),
    }

    mockOrder = new PrintifyOrderBridge({
      id: "order_1",
      medusa_order_id: "medusa-order-1",
      status: "pending",
      shippingMethod: 1,
      line_items: [
        {
          printifyProductId: "prod-1",
          printifyVariantId: 100,
          quantity: 2,
        },
      ],
      shipping_address: {
        first_name: "John",
        last_name: "Doe",
        address1: "123 Main St",
        city: "New York",
        zip: "10001",
        country_code: "US",
      },
      total_price: 3998,
      created_at: new Date(),
      updated_at: new Date(),
    })
  })

  it("should pass when shipping method is valid", async () => {
    await expect(
      validateShippingMethod(mockApiClient, mockOrder, 2),
    ).resolves.toBeUndefined()

    expect(mockApiClient.calculateShipping).toHaveBeenCalledTimes(1)
  })

  it("should throw when shipping method is invalid", async () => {
    await expect(
      validateShippingMethod(mockApiClient, mockOrder, 99),
    ).rejects.toThrow(/Shipping method 99 is not available/)

    await expect(
      validateShippingMethod(mockApiClient, mockOrder, 99),
    ).rejects.toThrow(/Available: 1 \(Standard\), 2 \(Express\), 3 \(Priority\)/)
  })

  it("should validate the default method (1) against the API", async () => {
    // Order has no explicit shipping method, falls back to default 1
    mockOrder = new PrintifyOrderBridge({
      ...mockOrder.entity,
      shippingMethod: undefined,
    })

    await expect(
      validateShippingMethod(mockApiClient, mockOrder),
    ).resolves.toBeUndefined()

    expect(mockApiClient.calculateShipping).toHaveBeenCalledTimes(1)
  })

  it("should reject when default method is not available", async () => {
    mockApiClient.calculateShipping.mockResolvedValue([
      { id: 5, name: "International", cost: 2500 },
    ])

    mockOrder = new PrintifyOrderBridge({
      ...mockOrder.entity,
      shippingMethod: undefined,
    })

    await expect(
      validateShippingMethod(mockApiClient, mockOrder),
    ).rejects.toThrow(/Shipping method 1 is not available/)
  })

  it("should propagate API errors", async () => {
    mockApiClient.calculateShipping.mockRejectedValue(
      new Error("Printify API unreachable"),
    )

    await expect(
      validateShippingMethod(mockApiClient, mockOrder, 1),
    ).rejects.toThrow("Printify API unreachable")
  })

  it("should use cached rates on subsequent calls", async () => {
    // First call populates cache
    await validateShippingMethod(mockApiClient, mockOrder, 1)
    expect(mockApiClient.calculateShipping).toHaveBeenCalledTimes(1)

    // Second call should use cache
    await validateShippingMethod(mockApiClient, mockOrder, 2)
    expect(mockApiClient.calculateShipping).toHaveBeenCalledTimes(1)
  })

  it("should use override method over order's shipping method", async () => {
    // Order has method 1, but override says 2
    await expect(
      validateShippingMethod(mockApiClient, mockOrder, 2),
    ).resolves.toBeUndefined()
  })
})
