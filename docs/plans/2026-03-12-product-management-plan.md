# Printify Product Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add product browsing, detail views, and sync controls to the Printify admin UI, with per-shop navigation from the shops page.

**Architecture:** Enhance existing shops page with clickable rows that navigate to a shop-filtered products page. Add a new product detail page and API route. Products page reads `shop_id` from URL params. Product detail page shows images, variants, Medusa link, and raw JSON.

**Tech Stack:** React (Medusa Admin SDK), `@medusajs/ui` components, `@medusajs/icons`, Medusa Query API (`ContainerRegistrationKeys.QUERY`) for link resolution.

---

### Task 1: Backend — Single Product API Route

**Files:**
- Create: `src/api/admin/printify/products/[id]/route.ts`
- Test: `tests/unit/api/products-detail-route.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/api/products-detail-route.test.ts`:

```typescript
import { describe, it, expect, jest, beforeEach } from "@jest/globals"

// We'll test the handler logic directly
describe("GET /admin/printify/products/[id]", () => {
  const mockProduct = {
    id: "prod_01",
    printify_id: "abc123",
    shop_id: "shop1",
    title: "Test Tee",
    description: "A tee",
    variants: [{ id: 1, title: "S", sku: "SKU-S", cost: 500, price: 1200, is_enabled: true }],
    images: [{ src: "https://img.test/1.png", position: "front", is_default: true }],
    print_areas: [],
    is_published: true,
    printify_data: { raw: true },
  }

  let mockService: Record<string, jest.Mock>
  let mockQuery: { graph: jest.Mock }

  beforeEach(() => {
    mockService = {
      retrievePrintifyProduct: jest.fn<() => Promise<typeof mockProduct>>().mockResolvedValue(mockProduct),
    }
    mockQuery = {
      graph: jest.fn<() => Promise<{ data: unknown[] }>>().mockResolvedValue({ data: [] }),
    }
  })

  it("returns product with linked medusa product id", async () => {
    mockQuery.graph.mockResolvedValue({
      data: [{ product: { id: "medusa_prod_01" } }],
    })

    const req = {
      params: { id: "prod_01" },
      scope: {
        resolve: jest.fn((key: string) => {
          if (key === "printify") return mockService
          if (key === "query") return mockQuery
          return undefined
        }),
      },
    }
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() }

    const { GET } = await import("../../src/api/admin/printify/products/[id]/route")
    await GET(req as any, res as any)

    expect(res.json).toHaveBeenCalledWith({
      product: mockProduct,
      medusa_product_id: "medusa_prod_01",
    })
  })

  it("returns null medusa_product_id when no link exists", async () => {
    mockQuery.graph.mockResolvedValue({ data: [] })

    const req = {
      params: { id: "prod_01" },
      scope: {
        resolve: jest.fn((key: string) => {
          if (key === "printify") return mockService
          if (key === "query") return mockQuery
          return undefined
        }),
      },
    }
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() }

    const { GET } = await import("../../src/api/admin/printify/products/[id]/route")
    await GET(req as any, res as any)

    expect(res.json).toHaveBeenCalledWith({
      product: mockProduct,
      medusa_product_id: null,
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/api/products-detail-route.test.ts --no-cache`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/api/admin/printify/products/[id]/route.ts`:

```typescript
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PRINTIFY_MODULE } from "../../../../../modules/printify"
import PrintifyModuleService from "../../../../../modules/printify/service"

// GET /admin/printify/products/:id
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const product = await service.retrievePrintifyProduct(req.params.id)

  // Resolve linked Medusa product via the link table
  let medusa_product_id: string | null = null
  try {
    const { data } = await query.graph({
      entity: "printify_product",
      fields: ["product.id"],
      filters: { id: product.id },
    })
    if (data.length > 0 && data[0].product) {
      medusa_product_id = data[0].product.id
    }
  } catch {
    // Link not resolved — leave as null
  }

  res.json({ product, medusa_product_id })
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/api/products-detail-route.test.ts --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/api/admin/printify/products/\[id\]/route.ts tests/unit/api/products-detail-route.test.ts
git commit -m "feat: add single product detail API route with Medusa link resolution"
```

---

### Task 2: Frontend — Make Shops Page Navigable

**Files:**
- Modify: `src/admin/routes/printify/page.tsx`

**Step 1: Update shops page to make rows clickable**

Replace the contents of `src/admin/routes/printify/page.tsx` with:

```tsx
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BuildingStorefront, ArrowRight } from "@medusajs/icons"
import { Container, Heading, Button, Table, Badge } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

type PrintifyShop = { id: string; printify_id: string; title: string }

const PrintifyPage = () => {
  const [shops, setShops] = useState<PrintifyShop[]>([])
  const [syncing, setSyncing] = useState(false)
  const navigate = useNavigate()

  const loadShops = async () => {
    const res = await fetch("/admin/printify/shops", { credentials: "include" })
    const json = await res.json()
    setShops(json.shops ?? [])
  }

  const syncShops = async () => {
    setSyncing(true)
    try {
      await fetch("/admin/printify/shops", { method: "POST", credentials: "include" })
      await loadShops()
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { loadShops() }, [])

  return (
    <Container className="p-8">
      <div className="flex justify-between items-center mb-6">
        <Heading>Printify Integration</Heading>
        <Button onClick={syncShops} isLoading={syncing} size="small">
          Sync Shops
        </Button>
      </div>

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Shop Name</Table.HeaderCell>
            <Table.HeaderCell>Printify ID</Table.HeaderCell>
            <Table.HeaderCell className="w-10"></Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {shops.map(shop => (
            <Table.Row
              key={shop.id}
              className="cursor-pointer hover:bg-ui-bg-base-hover"
              onClick={() => navigate(`/printify/products?shop_id=${shop.printify_id}&shop_name=${encodeURIComponent(shop.title)}`)}
            >
              <Table.Cell>{shop.title}</Table.Cell>
              <Table.Cell>
                <Badge color="grey" size="2xsmall">{shop.printify_id}</Badge>
              </Table.Cell>
              <Table.Cell>
                <ArrowRight className="text-ui-fg-muted" />
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Printify",
  icon: BuildingStorefront,
})

export default PrintifyPage
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/admin/routes/printify/page.tsx
git commit -m "feat: make shop rows clickable to navigate to products"
```

---

### Task 3: Frontend — Enhance Products Page with Shop Filtering

**Files:**
- Modify: `src/admin/routes/printify/products/page.tsx`

**Step 1: Rewrite products page with shop filtering, thumbnails, and clickable rows**

Replace `src/admin/routes/printify/products/page.tsx` with:

```tsx
import { Container, Heading, Button, Table, Badge, Input, Text } from "@medusajs/ui"
import { ArrowLeft } from "@medusajs/icons"
import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

type PrintifyImage = { src: string; position: string; is_default: boolean }
type PrintifyProduct = {
  id: string
  printify_id: string
  title: string
  is_published: boolean
  variants: { id: number; title: string; cost: number }[]
  images: PrintifyImage[]
}

const PrintifyProductsPage = () => {
  const [products, setProducts] = useState<PrintifyProduct[]>([])
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState("")
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const shopId = searchParams.get("shop_id")
  const shopName = searchParams.get("shop_name") ?? shopId ?? "All Shops"

  const loadProducts = async () => {
    const params = new URLSearchParams()
    if (shopId) params.set("shop_id", shopId)
    const res = await fetch(`/admin/printify/products?${params}`, { credentials: "include" })
    const json = await res.json()
    setProducts(json.products ?? [])
  }

  const syncProducts = async () => {
    setSyncing(true)
    try {
      await fetch("/admin/printify/products", {
        method: "POST",
        credentials: "include",
      })
      await loadProducts()
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { loadProducts() }, [shopId])

  const filtered = products.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase())
  )

  const getThumb = (images: PrintifyImage[]) => {
    const img = images?.find(i => i.is_default) ?? images?.[0]
    return img?.src ?? null
  }

  return (
    <Container className="p-8">
      <div className="mb-4">
        <button
          onClick={() => navigate("/printify")}
          className="flex items-center gap-1 text-ui-fg-muted hover:text-ui-fg-base text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Shops
        </button>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div>
          <Heading>{shopName}</Heading>
          <Text size="small" className="text-ui-fg-muted">
            {products.length} product{products.length !== 1 ? "s" : ""}
          </Text>
        </div>
        <Button onClick={syncProducts} isLoading={syncing} size="small">
          Sync Products
        </Button>
      </div>

      <Input
        placeholder="Search products..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="mb-4 max-w-xs"
      />

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell className="w-12"></Table.HeaderCell>
            <Table.HeaderCell>Title</Table.HeaderCell>
            <Table.HeaderCell>Variants</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {filtered.map(product => (
            <Table.Row
              key={product.id}
              className="cursor-pointer hover:bg-ui-bg-base-hover"
              onClick={() => navigate(`/printify/products/${product.id}`)}
            >
              <Table.Cell>
                {getThumb(product.images) ? (
                  <img
                    src={getThumb(product.images)!}
                    alt=""
                    className="w-10 h-10 rounded object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-ui-bg-subtle" />
                )}
              </Table.Cell>
              <Table.Cell>{product.title}</Table.Cell>
              <Table.Cell>{product.variants?.length ?? 0} variants</Table.Cell>
              <Table.Cell>
                <Badge color={product.is_published ? "green" : "grey"} size="2xsmall">
                  {product.is_published ? "Published" : "Draft"}
                </Badge>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

export default PrintifyProductsPage
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/admin/routes/printify/products/page.tsx
git commit -m "feat: add shop filtering, thumbnails, and clickable rows to products page"
```

---

### Task 4: Frontend — Product Detail Page

**Files:**
- Create: `src/admin/routes/printify/products/[id]/page.tsx`

**Step 1: Create product detail page**

Create `src/admin/routes/printify/products/[id]/page.tsx`:

```tsx
import { Container, Heading, Text, Badge, Table } from "@medusajs/ui"
import { ArrowLeft, ArrowUpRightOnBox } from "@medusajs/icons"
import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"

type PrintifyVariant = {
  id: number
  title: string
  sku: string
  cost: number
  price: number
  is_enabled: boolean
  is_default: boolean
}

type PrintifyImage = {
  src: string
  position: string
  is_default: boolean
}

type PrintifyProductDetail = {
  id: string
  printify_id: string
  shop_id: string
  title: string
  description: string
  variants: PrintifyVariant[]
  images: PrintifyImage[]
  is_published: boolean
  printify_data: Record<string, unknown> | null
}

const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`

const PrintifyProductDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [product, setProduct] = useState<PrintifyProductDetail | null>(null)
  const [medusaProductId, setMedusaProductId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rawOpen, setRawOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/admin/printify/products/${id}`, { credentials: "include" })
        const json = await res.json()
        setProduct(json.product)
        setMedusaProductId(json.medusa_product_id ?? null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <Container className="p-8">
        <Text>Loading...</Text>
      </Container>
    )
  }

  if (!product) {
    return (
      <Container className="p-8">
        <Text>Product not found.</Text>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-8">
      {/* Back nav */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-ui-fg-muted hover:text-ui-fg-base text-sm w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Products
      </button>

      {/* Header */}
      <Container className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <Heading>{product.title}</Heading>
            <Text size="small" className="text-ui-fg-muted mt-1">
              Printify ID: {product.printify_id}
            </Text>
          </div>
          <Badge color={product.is_published ? "green" : "grey"} size="small">
            {product.is_published ? "Published" : "Draft"}
          </Badge>
        </div>
        {product.description && (
          <Text className="mt-3">{product.description}</Text>
        )}
      </Container>

      {/* Images */}
      {product.images?.length > 0 && (
        <Container className="p-6">
          <Heading level="h2" className="mb-4">Images</Heading>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {product.images.map((img, i) => (
              <div key={i} className="relative">
                <img
                  src={img.src}
                  alt={`${product.title} - ${img.position}`}
                  className="w-full aspect-square rounded-lg object-cover"
                />
                <Badge
                  color="grey"
                  size="2xsmall"
                  className="absolute bottom-2 left-2"
                >
                  {img.position}
                </Badge>
              </div>
            ))}
          </div>
        </Container>
      )}

      {/* Variants */}
      <Container className="p-6">
        <Heading level="h2" className="mb-4">
          Variants ({product.variants?.length ?? 0})
        </Heading>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Title</Table.HeaderCell>
              <Table.HeaderCell>SKU</Table.HeaderCell>
              <Table.HeaderCell>Cost</Table.HeaderCell>
              <Table.HeaderCell>Price</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(product.variants ?? []).map(v => (
              <Table.Row key={v.id}>
                <Table.Cell>{v.title}</Table.Cell>
                <Table.Cell>
                  <code className="text-xs">{v.sku}</code>
                </Table.Cell>
                <Table.Cell>{formatCents(v.cost)}</Table.Cell>
                <Table.Cell>{formatCents(v.price)}</Table.Cell>
                <Table.Cell>
                  <Badge
                    color={v.is_enabled ? "green" : "grey"}
                    size="2xsmall"
                  >
                    {v.is_enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Container>

      {/* Linked Medusa Product */}
      <Container className="p-6">
        <Heading level="h2" className="mb-4">Medusa Product</Heading>
        {medusaProductId ? (
          <button
            onClick={() => navigate(`/products/${medusaProductId}`)}
            className="flex items-center gap-2 text-ui-fg-interactive hover:text-ui-fg-interactive-hover text-sm"
          >
            View linked product
            <ArrowUpRightOnBox className="w-4 h-4" />
          </button>
        ) : (
          <Text className="text-ui-fg-muted">No linked Medusa product</Text>
        )}
      </Container>

      {/* Raw JSON */}
      {product.printify_data && (
        <Container className="p-6">
          <button
            onClick={() => setRawOpen(!rawOpen)}
            className="flex items-center gap-2 w-full"
          >
            <Heading level="h2">Raw Printify Data</Heading>
            <Text size="small" className="text-ui-fg-muted">
              {rawOpen ? "Hide" : "Show"}
            </Text>
          </button>
          {rawOpen && (
            <pre className="mt-4 p-4 bg-ui-bg-subtle rounded-lg text-xs overflow-auto max-h-96">
              {JSON.stringify(product.printify_data, null, 2)}
            </pre>
          )}
        </Container>
      )}
    </div>
  )
}

export default PrintifyProductDetailPage
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/admin/routes/printify/products/\[id\]/page.tsx
git commit -m "feat: add product detail page with images, variants, Medusa link, raw JSON"
```

---

### Task 5: Fix `is_published` in Product Sync

**Files:**
- Modify: `src/workflows/sync-products.ts`
- Modify: `tests/unit/workflows/sync-products.test.ts`

**Step 1: Read the existing sync-products test**

Read `tests/unit/workflows/sync-products.test.ts` to understand the current test structure.

**Step 2: Add test for `is_published` mapping**

Add a test that verifies `is_published` is derived from the Printify product's visible field. The Printify API returns `is_locked` — a product that is NOT locked is considered published. Update the existing upsert assertion to check `is_published: true` when `is_locked: false`.

**Step 3: Update `upsertProductsStep` in `src/workflows/sync-products.ts`**

In the `data` object inside `upsertProductsStep`, add:

```typescript
is_published: !product.is_locked,
```

after the `printify_data` line.

**Step 4: Run tests**

Run: `npx jest tests/unit/workflows/sync-products.test.ts --no-cache`
Expected: PASS

**Step 5: Commit**

```bash
git add src/workflows/sync-products.ts tests/unit/workflows/sync-products.test.ts
git commit -m "fix: set is_published from Printify is_locked during product sync"
```

---

### Task 6: Integration Smoke Test

**Step 1: Run the full test suite**

Run: `npx jest --no-cache`
Expected: All tests pass

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Final commit if any adjustments needed**

---

## File Summary

| Action | File |
|--------|------|
| Create | `src/api/admin/printify/products/[id]/route.ts` |
| Create | `src/admin/routes/printify/products/[id]/page.tsx` |
| Create | `tests/unit/api/products-detail-route.test.ts` |
| Modify | `src/admin/routes/printify/page.tsx` |
| Modify | `src/admin/routes/printify/products/page.tsx` |
| Modify | `src/workflows/sync-products.ts` |
| Modify | `tests/unit/workflows/sync-products.test.ts` |
