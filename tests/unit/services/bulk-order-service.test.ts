/**
 * Unit Tests: Bulk Order Service Methods
 *
 * Tests for bulkSubmitOrders, bulkCancelOrders, and bulkRetryOrders
 * on PrintifyModuleService.
 */

import PrintifyModuleService from "../../../src/modules/printify/service"
import { PrintifyOrderStatus } from "../../../src/modules/printify/models/printify-order"

// Mock the MedusaService factory so we can instantiate without a real DB
jest.mock("@medusajs/framework/utils", () => {
  return {
    MedusaService: () => class MockBase {},
    Modules: {
      PRODUCT: "productService",
      ORDER: "orderService",
    },
    ContainerRegistrationKeys: {
      QUERY: "query",
    },
    model: {
      define: jest.fn().mockReturnValue({}),
      id: jest.fn().mockReturnValue({ primaryKey: jest.fn() }),
      text: jest.fn().mockReturnValue({ nullable: jest.fn(), unique: jest.fn(), default: jest.fn() }),
      boolean: jest.fn().mockReturnValue({ default: jest.fn() }),
      number: jest.fn().mockReturnValue({ default: jest.fn().mockReturnValue({ nullable: jest.fn() }), nullable: jest.fn().mockReturnValue({ default: jest.fn() }) }),
      json: jest.fn().mockReturnValue({ nullable: jest.fn() }),
      dateTime: jest.fn().mockReturnValue({ nullable: jest.fn() }),
    },
    Module: jest.fn(),
  }
})

describe("Bulk Order Service Methods", () => {
  let service: any
  let mockApiClient: any

  beforeEach(() => {
    service = new PrintifyModuleService()
    mockApiClient = {
      createOrder: jest.fn().mockResolvedValue({ id: "printify-order-1" }),
      cancelOrder: jest.fn().mockResolvedValue({}),
    }
  })

  describe("bulkSubmitOrders", () => {
    it("should submit all orders successfully", async () => {
      service.submitPrintifyOrder = jest.fn().mockResolvedValue({})

      const result = await service.bulkSubmitOrders(["order-1", "order-2"], mockApiClient)

      expect(result.success_count).toBe(2)
      expect(result.failure_count).toBe(0)
      expect(result.failed_orders).toHaveLength(0)
      expect(service.submitPrintifyOrder).toHaveBeenCalledTimes(2)
    })

    it("should handle partial failures", async () => {
      service.submitPrintifyOrder = jest.fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("Cannot submit"))

      const result = await service.bulkSubmitOrders(["order-1", "order-2"], mockApiClient)

      expect(result.success_count).toBe(1)
      expect(result.failure_count).toBe(1)
      expect(result.failed_orders).toEqual([
        { order_id: "order-2", error: "Cannot submit" },
      ])
    })

    it("should handle all failures", async () => {
      service.submitPrintifyOrder = jest.fn()
        .mockRejectedValue(new Error("API down"))

      const result = await service.bulkSubmitOrders(["order-1", "order-2"], mockApiClient)

      expect(result.success_count).toBe(0)
      expect(result.failure_count).toBe(2)
      expect(result.failed_orders).toHaveLength(2)
    })
  })

  describe("bulkCancelOrders", () => {
    it("should cancel all orders successfully", async () => {
      service.cancelPrintifyOrder = jest.fn().mockResolvedValue({})

      const result = await service.bulkCancelOrders(["order-1", "order-2"], mockApiClient)

      expect(result.success_count).toBe(2)
      expect(result.failure_count).toBe(0)
      expect(result.failed_orders).toHaveLength(0)
    })

    it("should pass reason to cancelPrintifyOrder", async () => {
      service.cancelPrintifyOrder = jest.fn().mockResolvedValue({})

      await service.bulkCancelOrders(["order-1"], mockApiClient, "Out of stock")

      expect(service.cancelPrintifyOrder).toHaveBeenCalledWith("order-1", mockApiClient, "Out of stock")
    })

    it("should handle partial cancel failures", async () => {
      service.cancelPrintifyOrder = jest.fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("Already shipped"))

      const result = await service.bulkCancelOrders(["order-1", "order-2"], mockApiClient)

      expect(result.success_count).toBe(1)
      expect(result.failure_count).toBe(1)
      expect(result.failed_orders).toEqual([
        { order_id: "order-2", error: "Already shipped" },
      ])
    })
  })

  describe("bulkRetryOrders", () => {
    it("should retry all FAILED orders successfully", async () => {
      service.getOrderBridge = jest.fn().mockResolvedValue({ status: PrintifyOrderStatus.FAILED })
      service.updatePrintifyOrders = jest.fn().mockResolvedValue([{}])

      const result = await service.bulkRetryOrders(["order-1", "order-2"])

      expect(result.success_count).toBe(2)
      expect(result.failure_count).toBe(0)
      expect(service.updatePrintifyOrders).toHaveBeenCalledTimes(2)
      expect(service.updatePrintifyOrders).toHaveBeenCalledWith([
        expect.objectContaining({
          status: PrintifyOrderStatus.PENDING,
          retry_count: 0,
          error_details: null,
          last_error_at: null,
        }),
      ])
    })

    it("should skip non-FAILED orders with failure message", async () => {
      service.getOrderBridge = jest.fn()
        .mockResolvedValueOnce({ status: PrintifyOrderStatus.FAILED })
        .mockResolvedValueOnce({ status: PrintifyOrderStatus.PENDING })
      service.updatePrintifyOrders = jest.fn().mockResolvedValue([{}])

      const result = await service.bulkRetryOrders(["order-1", "order-2"])

      expect(result.success_count).toBe(1)
      expect(result.failure_count).toBe(1)
      expect(result.failed_orders).toEqual([
        { order_id: "order-2", error: "Order is not in FAILED status (current: pending)" },
      ])
      expect(service.updatePrintifyOrders).toHaveBeenCalledTimes(1)
    })

    it("should handle order not found errors", async () => {
      service.getOrderBridge = jest.fn().mockRejectedValue(new Error("Order not found"))
      service.updatePrintifyOrders = jest.fn()

      const result = await service.bulkRetryOrders(["order-1"])

      expect(result.success_count).toBe(0)
      expect(result.failure_count).toBe(1)
      expect(result.failed_orders).toEqual([
        { order_id: "order-1", error: "Order not found" },
      ])
      expect(service.updatePrintifyOrders).not.toHaveBeenCalled()
    })
  })
})
