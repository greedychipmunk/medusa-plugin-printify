/**
 * Unit Tests: VariantAvailabilityCache
 */

import { VariantAvailabilityCache } from "../../../src/modules/printify/utils/variant-availability-cache"

describe("VariantAvailabilityCache", () => {
  let cache: VariantAvailabilityCache

  beforeEach(() => {
    cache = new VariantAvailabilityCache(5)
  })

  afterEach(() => {
    cache.clear()
  })

  const variants = [
    {
      id: 1001,
      title: "Small",
      sku: "TSH-S",
      price: 2500,
      compare_at_price: 800,
      options: { Size: "S" },
      is_available: true,
      is_enabled: true,
      images: ["https://images.printify.com/tshirt.jpg"],
    },
  ]

  // 1. Cache and retrieve variants
  it("should cache and retrieve variants", () => {
    cache.set("prod-1", variants)
    const result = cache.get("prod-1")
    expect(result).not.toBeNull()
    expect(result!.variants).toEqual(variants)
    expect(result!.fetchedAt).toBeInstanceOf(Date)
  })

  // 2. Return null on miss
  it("should return null on cache miss", () => {
    const result = cache.get("nonexistent")
    expect(result).toBeNull()
  })

  // 3. Return null for expired entries
  it("should return null for expired entries", () => {
    const shortCache = new VariantAvailabilityCache(0) // immediate expiry
    shortCache.set("prod-1", variants)
    const result = shortCache.get("prod-1")
    expect(result).toBeNull()
    shortCache.clear()
  })

  // 4. Different keys for different products
  it("should store separately per product", () => {
    const variants2 = [{ ...variants[0], id: 2001, title: "Large" }]
    cache.set("prod-1", variants)
    cache.set("prod-2", variants2)

    expect(cache.get("prod-1")!.variants[0].id).toBe(1001)
    expect(cache.get("prod-2")!.variants[0].id).toBe(2001)
  })

  // 5. Clear all entries
  it("should clear all entries", () => {
    cache.set("prod-1", variants)
    cache.clear()
    expect(cache.get("prod-1")).toBeNull()
  })

  // 6. Return stats
  it("should return stats", () => {
    cache.set("prod-1", variants)
    const stats = cache.getStats()
    expect(stats.size).toBe(1)
    expect(stats.ttlMs).toBe(5 * 60 * 1000)
  })

  // 7. Overwrite existing entry
  it("should overwrite existing entry on re-set", () => {
    cache.set("prod-1", variants)
    const updated = [{ ...variants[0], is_available: false }]
    cache.set("prod-1", updated)
    expect(cache.get("prod-1")!.variants[0].is_available).toBe(false)
    expect(cache.getStats().size).toBe(1)
  })
})
