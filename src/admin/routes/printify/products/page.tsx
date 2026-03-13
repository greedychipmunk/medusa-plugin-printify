import { Container, Heading, Button, Table, Badge, Input, Text, Switch } from "@medusajs/ui"
import { ArrowLeft } from "@medusajs/icons"
import { useState, useEffect } from "react"
import { Link, useSearchParams } from "react-router-dom"

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

  const toggleVisibility = async (product: PrintifyProduct) => {
    const newValue = !product.is_published
    setProducts(prev =>
      prev.map(p => p.id === product.id ? { ...p, is_published: newValue } : p)
    )
    try {
      const res = await fetch(`/admin/printify/products/${product.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: newValue }),
      })
      if (!res.ok) throw new Error("Request failed")
    } catch {
      setProducts(prev =>
        prev.map(p => p.id === product.id ? { ...p, is_published: product.is_published } : p)
      )
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

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell className="w-12"></Table.HeaderCell>
            <Table.HeaderCell>Title</Table.HeaderCell>
            <Table.HeaderCell>Variants</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
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
                  <Badge color={product.is_published ? "green" : "grey"} size="2xsmall">
                    {product.is_published ? "Published" : "Draft"}
                  </Badge>
                </Link>
              </Table.Cell>
              <Table.Cell onClick={e => e.stopPropagation()}>
                <Switch
                  checked={product.is_published}
                  onCheckedChange={() => toggleVisibility(product)}
                />
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

export default PrintifyProductsPage
