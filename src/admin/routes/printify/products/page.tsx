import { Container, Heading, Button, Table, Badge, Input, Text, Switch } from "@medusajs/ui"
import { ArrowLeft } from "@medusajs/icons"
import { useState, useEffect } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { computeEffectiveVisibility } from "../../../../workflows/visibility"

type PrintifyImage = { src: string; position: string; is_default: boolean }
type PrintifyProduct = {
  id: string
  printify_id: string
  title: string
  is_published: boolean
  is_locked?: boolean
  visibility_override?: boolean | null
  printify_data?: Record<string, unknown> | null
  variants: { id: number; title: string; cost: number }[]
  images: PrintifyImage[]
}

const PrintifyProductsPage = () => {
  const [products, setProducts] = useState<PrintifyProduct[]>([])
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState("")
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [visibilityError, setVisibilityError] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
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

  const canShow = (product: PrintifyProduct) =>
    computeEffectiveVisibility({ ...product, visibility_override: true }) === "published"

  const toggleVisibility = async (product: PrintifyProduct) => {
    const newValue = computeEffectiveVisibility(product) !== "published"
    if (newValue && !canShow(product)) return
    setTogglingId(product.id)
    setVisibilityError(null)
    try {
      const res = await fetch(`/admin/printify/products/${product.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: newValue }),
      })
      const json = await res.json()
      if (json.product) {
        setProducts(prev => prev.map(p => p.id === product.id ? json.product : p))
      }
      if (!res.ok) throw new Error(json.error ?? json.message ?? "Failed to update storefront visibility")
    } catch (error) {
      setVisibilityError(error instanceof Error ? error.message : "Failed to update storefront visibility")
    } finally {
      setTogglingId(null)
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

  const isPublishing = (product: PrintifyProduct) => product.is_locked === true

  return (
    <Container className="p-8">
      <div className="mb-4">
        <Link
          to="/printify"
          className="flex items-center gap-1 text-ui-fg-muted hover:text-ui-fg-base text-sm no-underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Shops
        </Link>
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

      {visibilityError && <Text role="alert" className="mb-4 text-ui-fg-error">{visibilityError}</Text>}

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell className="w-12"></Table.HeaderCell>
            <Table.HeaderCell>Title</Table.HeaderCell>
            <Table.HeaderCell>Variants</Table.HeaderCell>
            <Table.HeaderCell>Printify Status</Table.HeaderCell>
            <Table.HeaderCell>Visible on Store</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {filtered.map(product => (
            <Table.Row key={product.id}>
              <Table.Cell>
                <Link to={`/printify/products/${product.id}`} className="block">
                  {getThumb(product.images) ? (
                    <img
                      src={getThumb(product.images)!}
                      alt=""
                      className="w-10 h-10 rounded object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-ui-bg-subtle" />
                  )}
                </Link>
              </Table.Cell>
              <Table.Cell>
                <Link to={`/printify/products/${product.id}`} className="block text-inherit no-underline">
                  {product.title}
                </Link>
              </Table.Cell>
              <Table.Cell>
                <Link to={`/printify/products/${product.id}`} className="block text-inherit no-underline">
                  {product.variants?.length ?? 0} variants
                </Link>
              </Table.Cell>
              <Table.Cell>
                <Link to={`/printify/products/${product.id}`} className="block no-underline">
                  <Badge
                    color={isPublishing(product) ? "orange" : canShow(product) ? "green" : "grey"}
                    size="2xsmall"
                  >
                    {isPublishing(product) ? "Publishing" : canShow(product) ? "Published" : "Draft"}
                  </Badge>
                </Link>
              </Table.Cell>
              <Table.Cell onClick={e => e.stopPropagation()}>
                <Switch
                  checked={computeEffectiveVisibility(product) === "published"}
                  onCheckedChange={() => toggleVisibility(product)}
                  disabled={togglingId !== null || !canShow(product)}
                  aria-label={`Storefront visibility for ${product.title}`}
                />
                {!canShow(product) && (
                  <Text size="small" className="text-ui-fg-muted">Publish in Printify first</Text>
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

export default PrintifyProductsPage
