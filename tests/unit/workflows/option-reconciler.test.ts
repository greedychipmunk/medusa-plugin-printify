import {
  planOptionReconciliation,
  applyOptionReconciliation,
  type ExistingProductOption,
} from "../../../src/workflows/option-reconciler"

const vals = (...v: string[]) => v.map((value) => ({ value }))

// Shape of the three production products stuck since 2026-09-29: Medusa
// still has "Sizes"/"Colors"; Printify renamed them.
const legacyExisting: ExistingProductOption[] = [
  { id: "opt_colors", title: "Colors", is_exclusive: true, values: vals("Black", "Dark Heather Grey") },
  { id: "opt_sizes", title: "Sizes", is_exclusive: true, values: vals("S", "M", "L", "XL", "2XL") },
]
const renamedTargets = [
  { title: "Clothing sizes", values: ["S", "M", "L", "XL", "2XL", "3XL"] },
  { title: "Gildan Colors", values: ["Black", "Dark Heather Grey"] },
]

describe("planOptionReconciliation", () => {
  it("keeps exact title matches and does nothing else", () => {
    const plan = planOptionReconciliation(
      [
        { id: "opt_s", title: "Clothing sizes", is_exclusive: true, values: vals("S") },
        { id: "opt_c", title: "Gildan Colors", is_exclusive: true, values: vals("Black") },
      ],
      renamedTargets
    )
    expect([...plan.matched]).toEqual([
      ["Clothing sizes", "opt_s"],
      ["Gildan Colors", "opt_c"],
    ])
    expect(plan.renames).toEqual([])
    expect(plan.creates).toEqual([])
  })

  it("renames options Printify renamed, pairing by value overlap (the production case)", () => {
    const plan = planOptionReconciliation(legacyExisting, renamedTargets)
    expect(plan.matched.size).toBe(0)
    expect(plan.creates).toEqual([])
    expect(plan.renames).toEqual(
      expect.arrayContaining([
        { id: "opt_sizes", from: "Sizes", to: "Clothing sizes" },
        { id: "opt_colors", from: "Colors", to: "Gildan Colors" },
      ])
    )
    expect(plan.renames).toHaveLength(2)
  })

  it("never renames a global option — creates an exclusive one instead", () => {
    const plan = planOptionReconciliation(
      [{ id: "opt_global", title: "Size", is_exclusive: false, values: vals("S", "M") }],
      [{ title: "Clothing sizes", values: ["S", "M"] }]
    )
    expect(plan.renames).toEqual([])
    expect(plan.creates).toEqual([{ title: "Clothing sizes", values: ["S", "M"] }])
  })

  it("treats unknown exclusivity as not renameable", () => {
    const plan = planOptionReconciliation(
      [{ id: "opt_unknown", title: "Sizes", values: vals("S") }],
      [{ title: "Clothing sizes", values: ["S"] }]
    )
    expect(plan.renames).toEqual([])
    expect(plan.creates).toHaveLength(1)
  })

  it("does not pair options with no shared values", () => {
    const plan = planOptionReconciliation(
      [{ id: "opt_material", title: "Material", is_exclusive: true, values: vals("Cotton") }],
      [{ title: "Clothing sizes", values: ["S", "M"] }]
    )
    expect(plan.renames).toEqual([])
    expect(plan.creates).toEqual([{ title: "Clothing sizes", values: ["S", "M"] }])
  })

  it("pairs each existing option at most once, strongest overlap first", () => {
    const plan = planOptionReconciliation(
      [{ id: "opt_sizes", title: "Sizes", is_exclusive: true, values: vals("S", "M", "L") }],
      [
        { title: "Kids sizes", values: ["S"] },
        { title: "Clothing sizes", values: ["S", "M", "L"] },
      ]
    )
    expect(plan.renames).toEqual([{ id: "opt_sizes", from: "Sizes", to: "Clothing sizes" }])
    expect(plan.creates).toEqual([{ title: "Kids sizes", values: ["S"] }])
  })

  it("mixes match, rename, and create in one product", () => {
    const plan = planOptionReconciliation(
      [
        { id: "opt_sizes", title: "Sizes", is_exclusive: true, values: vals("S", "M") },
        { id: "opt_color", title: "Color", is_exclusive: true, values: vals("Red") },
      ],
      [
        { title: "Color", values: ["Red", "Blue"] },
        { title: "Clothing sizes", values: ["S", "M"] },
        { title: "Fit", values: ["Slim"] },
      ]
    )
    expect([...plan.matched]).toEqual([["Color", "opt_color"]])
    expect(plan.renames).toEqual([{ id: "opt_sizes", from: "Sizes", to: "Clothing sizes" }])
    expect(plan.creates).toEqual([{ title: "Fit", values: ["Slim"] }])
  })
})

describe("applyOptionReconciliation", () => {
  const service = {
    updateProductOptions: jest.fn(),
    createProductOptions: jest.fn(),
  }

  beforeEach(() => {
    service.updateProductOptions.mockResolvedValue({})
    service.createProductOptions.mockImplementation(async (input: { title: string }[]) =>
      input.map((opt, i) => ({ id: `opt_new_${i}`, title: opt.title }))
    )
  })

  it("renames in place and creates new options as product-exclusive", async () => {
    const ids = await applyOptionReconciliation(service as any, {
      matched: new Map([["Color", "opt_color"]]),
      renames: [{ id: "opt_sizes", from: "Sizes", to: "Clothing sizes" }],
      creates: [{ title: "Fit", values: ["Slim"] }],
    })

    expect(service.updateProductOptions).toHaveBeenCalledWith("opt_sizes", { title: "Clothing sizes" })
    expect(service.createProductOptions).toHaveBeenCalledWith([
      { title: "Fit", values: ["Slim"], is_exclusive: true },
    ])
    expect([...ids]).toEqual([
      ["Color", "opt_color"],
      ["Clothing sizes", "opt_sizes"],
      ["Fit", "opt_new_0"],
    ])
  })

  it("makes no write calls when everything already matches", async () => {
    await applyOptionReconciliation(service as any, {
      matched: new Map([["Color", "opt_color"]]),
      renames: [],
      creates: [],
    })
    expect(service.updateProductOptions).not.toHaveBeenCalled()
    expect(service.createProductOptions).not.toHaveBeenCalled()
  })
})
