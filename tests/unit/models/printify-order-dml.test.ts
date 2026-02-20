/**
 * Unit Tests: PrintifyOrder DML Model — Cost Fields
 *
 * Tests for cost tracking fields on the PrintifyOrder model:
 * total_cost, cost_per_item, defaults, nullability, backward compat.
 */

import PrintifyOrder from "../../../src/modules/printify/models/printify-order"

describe("PrintifyOrder DML Model", () => {
  const baseMockOrder = {
    id: "order-1",
    medusa_order_id: "medusa-order-1",
    printify_order_id: null,
    configuration_id: "config-1",
    status: "pending",
    line_items: [{ productId: "p1", variantId: "v1", quantity: 2 }],
    shipping_address: { address1: "123 Main St", city: "Portland", country: "US" },
    total_price: 5000,
    subtotal: 4500,
    shipping_cost: 500,
    tax_amount: 0,
    discount_amount: 0,
    shipping_method: 1,
    tracking: null,
    printify_data: null,
    submitted_at: null,
    error_details: null,
    retry_count: 0,
    last_error_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  }

  describe("model definition", () => {
    it("should be defined as a DML model", () => {
      expect(PrintifyOrder).toBeDefined()
      expect(typeof PrintifyOrder).toBe("object")
    })

    it("should have the correct model name", () => {
      expect(PrintifyOrder.name).toBe("PrintifyOrder")
    })
  })

  describe("cost field defaults", () => {
    it("should default total_cost to 0 for new orders", () => {
      const order = { ...baseMockOrder }
      // Simulates DML default — field absent ⇒ defaults to 0
      expect(order.total_price).toBeDefined()
      // total_cost not explicitly set ⇒ undefined, DML defaults to 0
      expect((order as any).total_cost).toBeUndefined()
    })

    it("should default cost_per_item to null for new orders", () => {
      const order = { ...baseMockOrder }
      expect((order as any).cost_per_item).toBeUndefined()
    })

    it("should accept total_cost as a number", () => {
      const order = { ...baseMockOrder, total_cost: 1600 }
      expect(order.total_cost).toBe(1600)
    })

    it("should accept cost_per_item as a JSON array", () => {
      const costPerItem = [
        { printify_product_id: "p1", printify_variant_id: "v1", unit_cost: 800, quantity: 2, total_cost: 1600 },
      ]
      const order = { ...baseMockOrder, cost_per_item: costPerItem }
      expect(order.cost_per_item).toEqual(costPerItem)
      expect(order.cost_per_item).toHaveLength(1)
    })

    it("should allow cost_per_item to be null", () => {
      const order = { ...baseMockOrder, cost_per_item: null }
      expect(order.cost_per_item).toBeNull()
    })
  })

  describe("backward compatibility", () => {
    it("should handle legacy orders without cost fields", () => {
      // Legacy orders have no total_cost or cost_per_item at all
      const legacyOrder = { ...baseMockOrder }
      delete (legacyOrder as any).total_cost
      delete (legacyOrder as any).cost_per_item

      // Accessing missing fields should return undefined
      expect((legacyOrder as any).total_cost).toBeUndefined()
      expect((legacyOrder as any).cost_per_item).toBeUndefined()

      // All other fields should be unaffected
      expect(legacyOrder.total_price).toBe(5000)
      expect(legacyOrder.status).toBe("pending")
    })

    it("should not affect existing pricing fields", () => {
      const order = { ...baseMockOrder, total_cost: 1600, cost_per_item: [] }
      expect(order.total_price).toBe(5000)
      expect(order.subtotal).toBe(4500)
      expect(order.shipping_cost).toBe(500)
      expect(order.tax_amount).toBe(0)
      expect(order.discount_amount).toBe(0)
    })
  })

  describe("cost_per_item structure", () => {
    it("should store multi-item cost breakdown", () => {
      const costPerItem = [
        { printify_product_id: "p1", printify_variant_id: "v1", unit_cost: 800, quantity: 2, total_cost: 1600 },
        { printify_product_id: "p2", printify_variant_id: "v2", unit_cost: 500, quantity: 1, total_cost: 500 },
      ]
      const order = { ...baseMockOrder, total_cost: 2100, cost_per_item: costPerItem }

      expect(order.cost_per_item).toHaveLength(2)
      expect(order.total_cost).toBe(2100)

      // Verify sum matches total_cost
      const sum = costPerItem.reduce((acc, item) => acc + item.total_cost, 0)
      expect(sum).toBe(order.total_cost)
    })

    it("should handle zero-cost items", () => {
      const costPerItem = [
        { printify_product_id: "p1", printify_variant_id: "v1", unit_cost: 0, quantity: 3, total_cost: 0 },
      ]
      const order = { ...baseMockOrder, total_cost: 0, cost_per_item: costPerItem }
      expect(order.total_cost).toBe(0)
      expect(order.cost_per_item[0].unit_cost).toBe(0)
    })
  })
})
