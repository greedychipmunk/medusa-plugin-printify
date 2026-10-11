import { Container, Heading, Text, Badge, Table, Switch, Label } from "@medusajs/ui"
import { ArrowLeft, ArrowUpRightOnBox } from "@medusajs/icons"
import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { computeEffectiveVisibility } from "../../../../../workflows/visibility"

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
  is_locked?: boolean
  visibility_override?: boolean | null
  printify_data: Record<string, unknown> | null
}

const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`

const PrintifyProductDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<PrintifyProductDetail | null>(null)
  const [medusaProductId, setMedusaProductId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rawOpen, setRawOpen] = useState(false)
  const [visibilityError, setVisibilityError] = useState<string | null>(null)
  const isVisible = product !== null && computeEffectiveVisibility(product) === "published"
  const canShow = product !== null &&
    computeEffectiveVisibility({ ...product, visibility_override: true }) === "published"
  const [toggling, setToggling] = useState(false)

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

  const toggleVisibility = async () => {
    const newValue = !isVisible
    if (newValue && !canShow) return
    setToggling(true)
    setVisibilityError(null)
    try {
      const res = await fetch(`/admin/printify/products/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: newValue }),
      })
      const json = await res.json()
      if (json.product) setProduct(json.product)
      if (!res.ok) throw new Error(json.error ?? json.message ?? "Failed to update storefront visibility")
    } catch (error) {
      setVisibilityError(error instanceof Error ? error.message : "Failed to update storefront visibility")
    } finally {
      setToggling(false)
    }
  }

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
          <div className="flex items-center gap-3">
            <Text size="small" className="text-ui-fg-muted">Printify Status</Text>
            <Badge color={product.is_locked === true ? "orange" : canShow ? "green" : "grey"} size="small">
              {product.is_locked === true ? "Publishing" : canShow ? "Published" : "Draft"}
            </Badge>
            <Switch
              id="visibility-toggle"
              checked={isVisible}
              onCheckedChange={toggleVisibility}
              disabled={toggling || !canShow}
            />
            <Label htmlFor="visibility-toggle" className="text-ui-fg-muted text-sm cursor-pointer">
              {isVisible ? "Visible on storefront" : "Hidden from storefront"}
            </Label>
          </div>
        </div>
        {!canShow && (
          <Text size="small" className="mt-3 text-ui-fg-muted">Publish in Printify first and wait for publishing to finish.</Text>
        )}
        {visibilityError && <Text role="alert" className="mt-3 text-ui-fg-error">{visibilityError}</Text>}
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
