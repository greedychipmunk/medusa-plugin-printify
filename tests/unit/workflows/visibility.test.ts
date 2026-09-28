import { computeEffectiveVisibility } from "../../../src/workflows/visibility"

describe("computeEffectiveVisibility", () => {
  it("follows Printify publish state when override is null", () => {
    expect(computeEffectiveVisibility({ is_published: true, visibility_override: null })).toBe("published")
    expect(computeEffectiveVisibility({ is_published: false, visibility_override: null })).toBe("draft")
  })

  it("treats missing override as follow-Printify", () => {
    expect(computeEffectiveVisibility({ is_published: true })).toBe("published")
    expect(computeEffectiveVisibility({ is_published: false })).toBe("draft")
  })

  it("override true forces published even when Printify says unpublished", () => {
    expect(computeEffectiveVisibility({ is_published: false, visibility_override: true })).toBe("published")
  })

  it("override false forces draft even when Printify says published", () => {
    expect(computeEffectiveVisibility({ is_published: true, visibility_override: false })).toBe("draft")
  })

  it("override false wins over override-true ambiguity is impossible (exhaustive matrix)", () => {
    // full matrix: override × publish
    const cases: Array<[boolean | null, boolean, "published" | "draft"]> = [
      [null, true, "published"],
      [null, false, "draft"],
      [true, true, "published"],
      [true, false, "published"],
      [false, true, "draft"],
      [false, false, "draft"],
    ]
    for (const [override, published, expected] of cases) {
      expect(computeEffectiveVisibility({ is_published: published, visibility_override: override })).toBe(expected)
    }
  })
})
