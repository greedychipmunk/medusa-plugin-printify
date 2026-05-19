import { reconcileMedusaStatus } from "../../../src/scripts/backfill-printify-status"

describe("reconcileMedusaStatus (pure helper)", () => {
  it("returns 'draft' when printify is_published is false and Medusa is published", () => {
    expect(reconcileMedusaStatus({ is_published: false }, "published")).toBe("draft")
  })

  it("returns null (no change) when printify is_published is false and Medusa is already draft", () => {
    expect(reconcileMedusaStatus({ is_published: false }, "draft")).toBeNull()
  })

  it("returns null (no change) when printify is_published is true and Medusa is published", () => {
    expect(reconcileMedusaStatus({ is_published: true }, "published")).toBeNull()
  })

  it("returns 'published' when printify is_published is true and Medusa is draft", () => {
    expect(reconcileMedusaStatus({ is_published: true }, "draft")).toBe("published")
  })

  it("returns null for any other Medusa status (proposed, rejected) — leave alone", () => {
    expect(reconcileMedusaStatus({ is_published: false }, "proposed")).toBeNull()
    expect(reconcileMedusaStatus({ is_published: false }, "rejected")).toBeNull()
  })
})
