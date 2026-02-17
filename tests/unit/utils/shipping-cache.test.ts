/**
 * Unit Tests: ShippingRateCache
 */

import { ShippingRateCache } from "../../../src/modules/printify/utils/shipping-cache"

describe("ShippingRateCache", () => {
  let cache: ShippingRateCache

  beforeEach(() => {
    cache = new ShippingRateCache(15)
  })

  afterEach(() => {
    cache.clear()
  })

  const lineItems = [
    { product_id: "prod-1", variant_id: 100, quantity: 2 },
  ]
  const address = { country_code: "US", zip: "10001", city: "New York", state_code: "NY" }
  const rates = [
    { id: 1, name: "Standard", cost: 495, currency: "USD" },
  ]

  // 1. Cache and retrieve rates
  it("should cache and retrieve rates", () => {
    cache.set(lineItems, address, rates)
    const result = cache.get(lineItems, address)
    expect(result).toEqual(rates)
  })

  // 2. Return null on miss
  it("should return null on cache miss", () => {
    const result = cache.get(lineItems, address)
    expect(result).toBeNull()
  })

  // 3. Same key regardless of line item order
  it("should produce same key regardless of line item order", () => {
    const items1 = [
      { product_id: "prod-a", variant_id: 1, quantity: 1 },
      { product_id: "prod-b", variant_id: 2, quantity: 3 },
    ]
    const items2 = [
      { product_id: "prod-b", variant_id: 2, quantity: 3 },
      { product_id: "prod-a", variant_id: 1, quantity: 1 },
    ]

    cache.set(items1, address, rates)
    const result = cache.get(items2, address)
    expect(result).toEqual(rates)
  })

  // 4. Different keys for different addresses
  it("should produce different keys for different addresses", () => {
    const address2 = { country_code: "CA", zip: "M5V 2T6", city: "Toronto", state_code: "ON" }

    cache.set(lineItems, address, rates)
    const result = cache.get(lineItems, address2)
    expect(result).toBeNull()
  })

  // 5. Return null for expired entries
  it("should return null for expired entries", () => {
    const shortCache = new ShippingRateCache(0) // 0 minutes TTL = immediate expiry
    shortCache.set(lineItems, address, rates)
    const result = shortCache.get(lineItems, address)
    expect(result).toBeNull()
    shortCache.clear()
  })

  // 6. Clear all entries
  it("should clear all entries", () => {
    cache.set(lineItems, address, rates)
    cache.clear()
    const result = cache.get(lineItems, address)
    expect(result).toBeNull()
  })

  // 7. Return stats
  it("should return stats", () => {
    cache.set(lineItems, address, rates)
    const stats = cache.getStats()
    expect(stats.size).toBe(1)
    expect(stats.ttlMs).toBe(15 * 60 * 1000)
  })
})
