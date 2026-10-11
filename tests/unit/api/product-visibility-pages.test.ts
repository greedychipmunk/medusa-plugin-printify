import { useEffect, useState, isValidElement, ReactNode, ReactElement } from "react"
import ProductsPage from "../../../src/admin/routes/printify/products/page"
import DetailPage from "../../../src/admin/routes/printify/products/[id]/page"

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: jest.fn(),
  useEffect: jest.fn(),
}))
jest.mock("react-router-dom", () => ({
  Link: "Link",
  useParams: () => ({ id: "prod_01" }),
  useSearchParams: () => [new URLSearchParams()],
}))
jest.mock("@medusajs/icons", () => ({ ArrowLeft: "ArrowLeft", ArrowUpRightOnBox: "ArrowUpRightOnBox" }))
jest.mock("@medusajs/ui", () => ({
  Container: "Container", Heading: "Heading", Button: "Button", Badge: "Badge",
  Input: "Input", Text: "Text", Switch: "Switch", Label: "Label",
  Table: Object.assign(() => null, {
    Header: "TableHeader", Row: "TableRow", HeaderCell: "TableHeaderCell",
    Body: "TableBody", Cell: "TableCell",
  }),
}))

type Node = ReactElement<Record<string, unknown>>
const nodes = (tree: ReactNode): Node[] => {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!isValidElement(tree)) return []
  const element = tree as Node
  return [element, ...nodes(element.props.children as ReactNode)]
}
const text = (tree: ReactNode): string => {
  if (Array.isArray(tree)) return tree.map(text).join(" ")
  if (isValidElement(tree)) return text((tree as Node).props.children as ReactNode)
  return typeof tree === "string" ? tree : ""
}
const switchIn = (tree: ReactNode) => nodes(tree).find(node => node.type === "Switch")!
const flush = () => new Promise<void>(resolve => setImmediate(resolve))

// Minimal hook harness: exercises page handlers and React element props without
// adding browser/test-renderer dependencies. State is heterogeneous by design.
let state: unknown[]
let cursor: number
let effects: (() => void)[]
let fetchMock: jest.Mock
const originalFetch = global.fetch
const render = (Page: () => ReactElement) => { cursor = 0; return Page() }
const product = {
  id: "prod_01", title: "Test Tee", printify_id: "abc123", shop_id: "shop1",
  description: "", variants: [], images: [], printify_data: {
    visible: true, is_locked: false,
    external: { id: "medusa_01", handle: "https://store.test/products/test-tee" },
  },
  is_published: true, is_locked: false, visibility_override: null,
}

beforeEach(() => {
  state = []; cursor = 0; effects = []
  ;(useState as jest.Mock).mockImplementation(initial => {
    const index = cursor++
    if (index >= state.length) state[index] = initial
    return [state[index], (next: unknown) => {
      state[index] = typeof next === "function" ? next(state[index]) : next
    }]
  })
  ;(useEffect as jest.Mock).mockImplementation(effect => { effects.push(effect) })
  fetchMock = jest.fn()
  global.fetch = fetchMock
})

afterAll(() => { global.fetch = originalFetch; jest.restoreAllMocks() })

describe.each([
  ["list", ProductsPage],
  ["detail", DetailPage],
] as const)("%s product page publication gate", (kind, Page) => {
  const load = async (record: typeof product | Record<string, unknown>) => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => kind === "list" ? { products: [record] } : { product: record } })
    render(Page)
    effects[0]()
    await flush()
    return render(Page)
  }

  it.each([
    { is_published: false, is_locked: false, visibility_override: true },
    { is_published: true, is_locked: true, visibility_override: true },
    { is_published: true, is_locked: undefined, visibility_override: true },
  ])("does not allow enabling draft, publishing, or unknown-lock products: %p", async flags => {
    const tree = await load({ ...product, ...flags })
    const toggle = switchIn(tree)
    expect(toggle.props.checked).toBe(false)
    expect(toggle.props.disabled).toBe(true)
    expect(text(tree)).toContain("Publish in Printify first")
    // Handler remains guarded even if invoked outside the disabled control.
    await (toggle.props.onCheckedChange as () => Promise<void>)()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    undefined,
    null,
    {},
    { visible: true, is_locked: false },
    { ...product.printify_data, external: null },
    { ...product.printify_data, external: {} },
    { ...product.printify_data, external: { id: "", handle: "https://store.test/test" } },
    { ...product.printify_data, external: { id: "medusa_01", handle: "" } },
    { ...product.printify_data, external: { id: "  ", handle: "  " } },
    { ...product.printify_data, external: "not-an-object" },
    { ...product.printify_data, external: [] },
    { ...product.printify_data, external: { id: 123, handle: true } },
  ])("blocks legacy canonical true/override true without raw publication proof: %p", async raw => {
    const tree = await load({ ...product, visibility_override: true, printify_data: raw })
    const toggle = switchIn(tree)
    expect(toggle.props.checked).toBe(false)
    expect(toggle.props.disabled).toBe(true)
    expect(text(tree)).toContain("Publish in Printify first")
    await (toggle.props.onCheckedChange as () => Promise<void>)()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("surfaces Publishing independently from hidden storefront visibility", async () => {
    const tree = await load({ ...product, is_locked: true })
    expect(text(tree)).toContain("Publishing")
    expect(switchIn(tree).props.checked).toBe(false)
  })

  it("keeps a Printify-published product hidden when local preference is false", async () => {
    const tree = await load({ ...product, visibility_override: false })
    expect(text(tree)).toContain("Published")
    expect(switchIn(tree).props.checked).toBe(false)
    expect(switchIn(tree).props.disabled).toBe(false)
  })

  it("hides via the legacy request field without changing the Printify status badge", async () => {
    const tree = await load(product)
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ product: { ...product, visibility_override: false } }) })
    expect(switchIn(tree).props.checked).toBe(true)
    await (switchIn(tree).props.onCheckedChange as () => Promise<void>)()
    expect(fetchMock).toHaveBeenLastCalledWith("/admin/printify/products/prod_01", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ is_published: false }),
    }))
    const updated = render(Page)
    expect(switchIn(updated).props.checked).toBe(false)
    expect(text(updated)).toContain("Published")
  })

  it("shows only from the verified server product response", async () => {
    const tree = await load({ ...product, visibility_override: false })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ product: { ...product, visibility_override: true } }) })
    await (switchIn(tree).props.onCheckedChange as () => Promise<void>)()
    expect(fetchMock).toHaveBeenLastCalledWith("/admin/printify/products/prod_01", expect.objectContaining({
      body: JSON.stringify({ is_published: true }),
    }))
    expect(switchIn(render(Page)).props.checked).toBe(true)
  })

  it("applies repaired publication flags and displays a rejected show error", async () => {
    const tree = await load({ ...product, visibility_override: false })
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({
      error: "Publish in Printify first", product: { ...product, is_locked: true, visibility_override: false },
    }) })
    await (switchIn(tree).props.onCheckedChange as () => Promise<void>)()
    const updated = render(Page)
    expect(switchIn(updated).props.checked).toBe(false)
    expect(switchIn(updated).props.disabled).toBe(true)
    expect(text(updated)).toContain("Publishing")
    expect(nodes(updated).find(node => node.props.role === "alert")?.props.children).toBe("Publish in Printify first")
  })

  it("reports verification failure without optimistically enabling visibility", async () => {
    const tree = await load({ ...product, visibility_override: false })
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Unable to verify Printify publication" }) })
    await (switchIn(tree).props.onCheckedChange as () => Promise<void>)()
    const updated = render(Page)
    expect(switchIn(updated).props.checked).toBe(false)
    expect(nodes(updated).find(node => node.props.role === "alert")?.props.children).toBe("Unable to verify Printify publication")
  })
})
