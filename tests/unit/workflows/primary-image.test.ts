import { selectPrimaryImage } from "../../../src/workflows/primary-image"

const img = (src: string, is_default: boolean) => ({ src, position: "front", is_default, variant_ids: [] as number[] })

describe("selectPrimaryImage", () => {
  it("returns the first is_default image", () => {
    expect(selectPrimaryImage([img("a", true), img("b", false)])).toBe("a")
  })

  it("picks the first default when Printify flags one per color", () => {
    expect(selectPrimaryImage([img("black", true), img("black-back", false), img("navy", true)])).toBe("black")
  })

  it("finds the default even when it is not first", () => {
    expect(selectPrimaryImage([img("back", false), img("front", true)])).toBe("front")
  })

  it("falls back to the first image when none is flagged default", () => {
    expect(selectPrimaryImage([img("a", false), img("b", false)])).toBe("a")
  })

  it("skips entries without a src", () => {
    expect(selectPrimaryImage([img("", true), img("b", true)])).toBe("b")
  })

  it("returns null for no images", () => {
    expect(selectPrimaryImage([])).toBeNull()
    expect(selectPrimaryImage(undefined)).toBeNull()
    expect(selectPrimaryImage(null)).toBeNull()
  })
})
