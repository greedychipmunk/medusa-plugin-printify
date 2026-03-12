import { Container, Heading, Text, Badge, Table } from "@medusajs/ui"
import { ArrowLeft, ArrowUpRightOnBox } from "@medusajs/icons"
import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"

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
      <Link
        to="/printify/products"
        className="flex items-center gap-1 text-ui-fg-muted hover:text-ui-fg-base text-sm w-fit no-underline"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Products
      </Link>

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
          <Link
            to={`/products/${medusaProductId}`}
            className="flex items-center gap-2 text-ui-fg-interactive hover:text-ui-fg-interactive-hover text-sm no-underline"
          >
            View linked product
            <ArrowUpRightOnBox className="w-4 h-4" />
          </Link>
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
