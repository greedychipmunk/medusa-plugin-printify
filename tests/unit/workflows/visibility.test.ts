import { computeEffectiveVisibility, isPrintifyPublished } from "../../../src/workflows/visibility"

const publication = { visible: true, is_locked: false, external: { id: "external_1", handle: "https://example.test/products/tee" } }

describe("computeEffectiveVisibility", () => {
  it.each([null, undefined, true, false])("requires upstream publication and completed publishing for override %s", (override) => {
    for (const published of [true, false]) {
      for (const locked of [true, false]) {
        expect(computeEffectiveVisibility({ is_published: published, is_locked: locked, visibility_override: override, printify_data: publication }))
          .toBe(published && !locked && override !== false ? "published" : "draft")
      }
    }
  })

  it.each([undefined, null, "true", "false", 0, 1])("fails closed for unknown/malformed publication: %s", (published) => {
    // API data is untrusted at runtime, despite the declared boolean DTO.
    const state = { is_published: published, is_locked: false, visibility_override: true }
    expect(computeEffectiveVisibility(state as unknown as Parameters<typeof computeEffectiveVisibility>[0])).toBe("draft")
  })

  it.each([undefined, null, "false", "true", 0, 1])("fails closed for unknown/malformed lock state: %s", (locked) => {
    const state = { is_published: true, is_locked: locked, visibility_override: true }
    expect(computeEffectiveVisibility(state as unknown as Parameters<typeof computeEffectiveVisibility>[0])).toBe("draft")
  })

  it("never force-shows an upstream draft or a product still publishing", () => {
    expect(computeEffectiveVisibility({ is_published: false, is_locked: false, visibility_override: true })).toBe("draft")
    expect(computeEffectiveVisibility({ is_published: true, is_locked: true, visibility_override: true })).toBe("draft")
  })

  it.each([undefined, null, {}, [], { id: "" }, { id: "external_1", handle: " " }, { id: 1, handle: "https://example.test" }])(
    "does not mistake default visible/unlocked state for publication without external evidence: %s", external => {
      const raw = { visible: true, is_locked: false, external }
      expect(isPrintifyPublished(raw)).toBe(false)
      expect(computeEffectiveVisibility({ is_published: true, is_locked: false, visibility_override: true, printify_data: raw })).toBe("draft")
    }
  )

  it("requires a successful publication record after unlock, not merely publishing_failed", () => {
    expect(isPrintifyPublished({ ...publication, external: null })).toBe(false)
    expect(isPrintifyPublished(publication)).toBe(true)
    expect(isPrintifyPublished({ ...publication, is_locked: true })).toBe(false)
    expect(isPrintifyPublished({ ...publication, visible: false })).toBe(false)
  })
})
