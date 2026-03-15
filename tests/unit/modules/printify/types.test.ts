import type {
  PrintifyProduct,
  PrintifyOption,
  PrintifyOptionValue,
  PrintifyImage,
} from "../../../../src/modules/printify/api-client"

describe("Printify types", () => {
  it("PrintifyProduct includes options array", () => {
    const product: PrintifyProduct = {
      id: "p1",
      title: "Test",
      description: "desc",
      variants: [],
      images: [],
      options: [
        {
          name: "Size",
          type: "size",
          values: [{ id: 1, title: "S" }],
        },
      ],
      print_areas: [],
      is_locked: false,
      visible: true,
    }
    expect(product.options).toHaveLength(1)
    expect(product.options[0].name).toBe("Size")
  })

  it("PrintifyImage includes variant_ids", () => {
    const image: PrintifyImage = {
      src: "https://example.com/img.jpg",
      variant_ids: [123, 456],
      position: "front",
      is_default: true,
    }
    expect(image.variant_ids).toEqual([123, 456])
  })

  it("PrintifyOptionValue has id and title", () => {
    const val: PrintifyOptionValue = { id: 42, title: "Medium" }
    expect(val.id).toBe(42)
    expect(val.title).toBe("Medium")
  })

  it("PrintifyOption has name, type, and values", () => {
    const opt: PrintifyOption = {
      name: "Color",
      type: "color",
      values: [
        { id: 1, title: "Red" },
        { id: 2, title: "Blue" },
      ],
    }
    expect(opt.name).toBe("Color")
    expect(opt.type).toBe("color")
    expect(opt.values).toHaveLength(2)
  })
})
