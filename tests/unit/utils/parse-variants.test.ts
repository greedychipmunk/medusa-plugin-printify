/**
 * Unit Tests: parseVariantsFromPrintifyData
 */

import { parseVariantsFromPrintifyData } from "../../../src/modules/printify/utils/parse-variants"

describe("parseVariantsFromPrintifyData", () => {
  const fullProductData = {
    options: [
      { name: "Size", type: "size", values: [{ id: 1, title: "S" }, { id: 2, title: "M" }] },
      { name: "Color", type: "color", values: [{ id: 10, title: "Red" }, { id: 11, title: "Blue" }] },
    ],
    variants: [
      { id: 1001, sku: "TSH-S-RED", cost: 800, price: 2500, title: "Small / Red", is_enabled: true, is_available: true, options: [1, 10] },
      { id: 1002, sku: "TSH-M-BLUE", cost: 800, price: 2500, title: "Medium / Blue", is_enabled: true, is_available: false, options: [2, 11] },
      { id: 1003, sku: "TSH-S-BLUE", cost: 800, price: 2500, title: "Small / Blue", is_enabled: false, is_available: true, options: [1, 11] },
    ],
    images: [
      { src: "https://images.printify.com/front.jpg", variant_ids: [1001, 1002], position: "front", is_default: true },
      { src: "https://images.printify.com/back.jpg", variant_ids: [1001], position: "back", is_default: false },
    ],
  }

  // 1. Basic parsing with options resolved
  it("should parse variants with resolved option names", () => {
    const result = parseVariantsFromPrintifyData(fullProductData)
    expect(result).toHaveLength(3)
    expect(result[0].options).toEqual({ Size: "S", Color: "Red" })
    expect(result[1].options).toEqual({ Size: "M", Color: "Blue" })
  })

  // 2. Image mapping
  it("should map images to correct variants", () => {
    const result = parseVariantsFromPrintifyData(fullProductData)
    // Variant 1001 is referenced in both images
    expect(result[0].images).toEqual([
      "https://images.printify.com/front.jpg",
      "https://images.printify.com/back.jpg",
    ])
    // Variant 1002 is referenced in only the front image
    expect(result[1].images).toEqual([
      "https://images.printify.com/front.jpg",
    ])
    // Variant 1003 is not referenced in any image
    expect(result[2].images).toEqual([])
  })

  // 3. Disabled variants
  it("should preserve is_enabled and is_available flags", () => {
    const result = parseVariantsFromPrintifyData(fullProductData)
    expect(result[0].is_enabled).toBe(true)
    expect(result[0].is_available).toBe(true)
    expect(result[1].is_available).toBe(false)
    expect(result[2].is_enabled).toBe(false)
  })

  // 4. Empty/missing data
  it("should return empty array for null input", () => {
    expect(parseVariantsFromPrintifyData(null)).toEqual([])
    expect(parseVariantsFromPrintifyData(undefined)).toEqual([])
    expect(parseVariantsFromPrintifyData({})).toEqual([])
  })

  // 5. Missing options array
  it("should handle product with no options gracefully", () => {
    const data = {
      variants: [
        { id: 2001, sku: "MUG-11", cost: 500, price: 1800, title: "11oz", is_enabled: true, is_available: true, options: [] },
      ],
      images: [],
    }
    const result = parseVariantsFromPrintifyData(data)
    expect(result).toHaveLength(1)
    expect(result[0].options).toEqual({})
    expect(result[0].images).toEqual([])
  })

  // 6. Price and SKU mapping
  it("should map price, compare_at_price, and sku correctly", () => {
    const result = parseVariantsFromPrintifyData(fullProductData)
    expect(result[0].price).toBe(2500)
    expect(result[0].compare_at_price).toBe(800)
    expect(result[0].sku).toBe("TSH-S-RED")
  })
})
