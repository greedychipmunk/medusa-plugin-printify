import { mapPrintifyOptions } from "../../../src/workflows/option-mapper"
import type { PrintifyOption, PrintifyVariant, PrintifyImage } from "../../../src/modules/printify/api-client"

const sizeColorOptions: PrintifyOption[] = [
  {
    name: "Size",
    type: "size",
    values: [
      { id: 1, title: "S" },
      { id: 2, title: "M" },
      { id: 3, title: "L" },
    ],
  },
  {
    name: "Color",
    type: "color",
    values: [
      { id: 10, title: "Red" },
      { id: 11, title: "Blue" },
    ],
  },
]

const variants: PrintifyVariant[] = [
  { id: 100, sku: "SKU-S-R", cost: 500, price: 1000, title: "S / Red", is_enabled: true, is_default: true, options: [1, 10] },
  { id: 101, sku: "SKU-S-B", cost: 500, price: 1000, title: "S / Blue", is_enabled: true, is_default: false, options: [1, 11] },
  { id: 102, sku: "SKU-M-R", cost: 500, price: 1000, title: "M / Red", is_enabled: true, is_default: false, options: [2, 10] },
  { id: 103, sku: "SKU-L-R", cost: 500, price: 1000, title: "L / Red", is_enabled: false, is_default: false, options: [3, 10] },
]

const images: PrintifyImage[] = [
  { src: "https://img.com/red-front.jpg", variant_ids: [100, 102], position: "front", is_default: true },
  { src: "https://img.com/blue-front.jpg", variant_ids: [101], position: "front", is_default: false },
  { src: "https://img.com/generic.jpg", position: "back", is_default: false },
]

describe("mapPrintifyOptions", () => {
  it("returns null when options array is empty", () => {
    expect(mapPrintifyOptions([], variants, images)).toBeNull()
  })

  it("builds separate Medusa options from Printify options", () => {
    const result = mapPrintifyOptions(sizeColorOptions, variants, images)!
    expect(result.medusaOptions).toEqual([
      { title: "Size", values: ["S", "M"] },
      { title: "Color", values: ["Red", "Blue"] },
    ])
  })

  it("excludes option values only used by disabled variants", () => {
    const result = mapPrintifyOptions(sizeColorOptions, variants, images)!
    const sizeOption = result.medusaOptions.find((o) => o.title === "Size")!
    expect(sizeOption.values).not.toContain("L")
  })

  it("maps variant numeric option IDs to { OptionName: ValueTitle }", () => {
    const result = mapPrintifyOptions(sizeColorOptions, variants, images)!
    const v100 = result.variantOptionMap.get(100)!
    expect(v100).toEqual({ Size: "S", Color: "Red" })
    const v101 = result.variantOptionMap.get(101)!
    expect(v101).toEqual({ Size: "S", Color: "Blue" })
  })

  it("excludes disabled variants from variantOptionMap", () => {
    const result = mapPrintifyOptions(sizeColorOptions, variants, images)!
    expect(result.variantOptionMap.has(103)).toBe(false)
  })

  it("maps images to variant IDs for enabled variants", () => {
    const result = mapPrintifyOptions(sizeColorOptions, variants, images)!
    const v100imgs = result.variantImageMap.get(100)!
    expect(v100imgs).toEqual([{ url: "https://img.com/red-front.jpg" }])
    const v101imgs = result.variantImageMap.get(101)!
    expect(v101imgs).toEqual([{ url: "https://img.com/blue-front.jpg" }])
  })

  it("excludes images without variant_ids from variant image map", () => {
    const result = mapPrintifyOptions(sizeColorOptions, variants, images)!
    for (const [, imgs] of result.variantImageMap) {
      expect(imgs.every((i) => i.url !== "https://img.com/generic.jpg")).toBe(true)
    }
  })

  it("handles single-option products", () => {
    const singleOption: PrintifyOption[] = [
      { name: "Size", type: "size", values: [{ id: 1, title: "S" }, { id: 2, title: "M" }] },
    ]
    const singleVariants: PrintifyVariant[] = [
      { id: 200, sku: "S1", cost: 500, price: 1000, title: "S", is_enabled: true, is_default: true, options: [1] },
      { id: 201, sku: "S2", cost: 500, price: 1000, title: "M", is_enabled: true, is_default: false, options: [2] },
    ]
    const result = mapPrintifyOptions(singleOption, singleVariants, [])!
    expect(result.medusaOptions).toEqual([{ title: "Size", values: ["S", "M"] }])
    expect(result.variantOptionMap.get(200)).toEqual({ Size: "S" })
  })
})
