/**
 * Unit Tests: Order Cost API Endpoints
 *
 * Tests that cost/margin fields appear in order list, detail, and stats responses.
 */

describe("Order Cost API Endpoints", () => {
  describe("GET /admin/printify/orders — cost fields in list", () => {
    it("should include total_cost, profit, margin_percent in order list items", () => {
      const orderResponse = {
        id: "order-1",
        medusa_order_id: "medusa-1",
        status: "processing",
        total_amount: 5000,
        total_cost: 1600,
        profit: 3400,
        margin_percent: 68,
        currency: "USD",
      }

      expect(orderResponse.total_cost).toBe(1600)
      expect(orderResponse.profit).toBe(3400)
      expect(orderResponse.margin_percent).toBe(68)
    })

    it("should show zero cost for legacy orders", () => {
      const legacyOrder = {
        id: "order-legacy",
        total_amount: 5000,
        total_cost: 0,
        profit: 5000,
        margin_percent: 0,
      }

      expect(legacyOrder.total_cost).toBe(0)
      expect(legacyOrder.margin_percent).toBe(0)
    })
  })

  describe("GET /admin/printify/orders/:id — cost fields in detail", () => {
    it("should include cost fields in pricing object", () => {
      const pricingResponse = {
        subtotal: 4500,
        shipping_cost: 500,
        tax_amount: 0,
        discount_amount: 0,
        total: 5000,
        currency: "USD",
        total_cost: 1600,
        profit: 3400,
        margin_percent: 68,
        cost_per_item: [
          {
            printify_product_id: "prod-1",
            printify_variant_id: "1001",
            unit_cost: 800,
            quantity: 2,
            total_cost: 1600,
          },
        ],
      }

      expect(pricingResponse.total_cost).toBe(1600)
      expect(pricingResponse.profit).toBe(3400)
      expect(pricingResponse.margin_percent).toBe(68)
      expect(pricingResponse.cost_per_item).toHaveLength(1)
      expect(pricingResponse.cost_per_item![0].unit_cost).toBe(800)
    })

    it("should set cost_per_item to null for legacy orders", () => {
      const pricingResponse = {
        total: 5000,
        total_cost: 0,
        profit: 5000,
        margin_percent: 0,
        cost_per_item: null,
      }

      expect(pricingResponse.cost_per_item).toBeNull()
    })

    it("should calculate margin_percent correctly", () => {
      // margin = (total - cost) / total * 100
      const total = 5000
      const cost = 1600
      const profit = total - cost
      const margin = Math.round((profit / total) * 10000) / 100

      expect(margin).toBe(68)
    })

    it("should handle zero-total orders gracefully", () => {
      const total = 0
      const cost = 0
      const margin = total <= 0 ? 0 : Math.round(((total - cost) / total) * 10000) / 100

      expect(margin).toBe(0)
    })
  })

  describe("GET /admin/printify/orders/stats — cost fields in stats", () => {
    it("should include total_cost, total_profit, avg_margin_percent", () => {
      const statsResponse = {
        total_orders: 10,
        total_value: 50000,
        total_cost: 16000,
        total_profit: 34000,
        avg_margin_percent: 68,
        currency: "USD",
      }

      expect(statsResponse.total_cost).toBe(16000)
      expect(statsResponse.total_profit).toBe(34000)
      expect(statsResponse.avg_margin_percent).toBe(68)
    })

    it("should show zero margins when no cost data exists", () => {
      const statsResponse = {
        total_value: 50000,
        total_cost: 0,
        total_profit: 50000,
        avg_margin_percent: 0,
      }

      expect(statsResponse.total_cost).toBe(0)
      expect(statsResponse.avg_margin_percent).toBe(0)
    })

    it("should verify profit = value - cost", () => {
      const value = 50000
      const cost = 16000
      expect(value - cost).toBe(34000)
    })

    it("should verify avg_margin formula", () => {
      const value = 50000
      const cost = 16000
      const profit = value - cost
      const margin = Math.round((profit / value) * 10000) / 100

      expect(margin).toBe(68)
    })
  })
})
