import { Container, Heading, Button, Table, Badge, Input } from "@medusajs/ui"
import { useState, useEffect } from "react"

type PrintifyProduct = {
  id: string
  printify_id: string
  title: string
  is_published: boolean
  variants: { id: number; title: string; cost: number }[]
}

const PrintifyProductsPage = () => {
  const [products, setProducts] = useState<PrintifyProduct[]>([])
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState("")

  const loadProducts = async () => {
    const res = await fetch("/admin/printify/products", { credentials: "include" })
    const json = await res.json()
    setProducts(json.products ?? [])
  }

  const syncProducts = async () => {
    setSyncing(true)
    try {
      await fetch("/admin/printify/products", { method: "POST", credentials: "include" })
      await loadProducts()
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { loadProducts() }, [])

  const filtered = products.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Container className="p-8">
      <div className="flex justify-between items-center mb-6">
        <Heading>Printify Products</Heading>
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
            <Table.HeaderCell>Title</Table.HeaderCell>
            <Table.HeaderCell>Variants</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {filtered.map(product => (
            <Table.Row key={product.id}>
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
