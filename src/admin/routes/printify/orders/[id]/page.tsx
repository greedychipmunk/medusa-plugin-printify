import { useState, useEffect } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  StatusBadge,
  toast,
  Toaster,
  Text,
  Heading,
} from "@medusajs/ui"
import { useParams, useNavigate } from "react-router-dom"
import { Container } from "../../../../components/container"
import { Header } from "../../../../components/header"

interface OrderItem {
  product_id: string
  variant_id: string
  printify_product_id: string
  printify_variant_id: string
  quantity: number
  unit_price: number
  total_price: number
  options?: Record<string, unknown>
}

interface CostPerItem {
  printify_product_id: string
  printify_variant_id: string
  unit_cost: number
  quantity: number
  total_cost: number
}

interface OrderPricing {
  subtotal: number
  shipping_cost: number
  tax_amount: number
  discount_amount: number
  total: number
  currency: string
  total_cost?: number
  profit?: number
  margin_percent?: number
  cost_per_item?: CostPerItem[] | null
}

interface ShippingAddress {
  first_name: string
  last_name: string
  email: string
  phone?: string
  company?: string
  address1: string
  address2?: string
  city: string
  region?: string
  zip: string
  country: string
}

interface OrderTracking {
  carrier?: string
  number?: string
  url?: string
  shipped_at?: string
}

interface OrderDetail {
  id: string
  medusa_order_id: string
  printify_order_id?: string
  status: string
  customer_id?: string
  customer_email: string
  items: OrderItem[]
  pricing: OrderPricing
  shipping_address: ShippingAddress
  tracking?: OrderTracking
  created_at: string
  updated_at: string
  submitted_at?: string
  last_error?: string
  medusa_order?: {
    id: string
    display_id: string
    status: string
    email: string
  }
}

const STATUS_COLORS: Record<string, "green" | "orange" | "blue" | "red" | "grey" | "purple"> = {
  pending: "grey",
  validated: "blue",
  submitted: "blue",
  processing: "orange",
  shipped: "purple",
  delivered: "green",
  cancelled: "grey",
  failed: "red",
}

const SUBMITTABLE_STATUSES = ["pending", "validated"]
const CANCELLABLE_STATUSES = ["pending", "validated", "submitted", "processing"]

const PrintifyOrderDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (id) {
      loadOrder()
    }
  }, [id])

  const loadOrder = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/admin/printify/orders/${id}`)
      const data = await response.json()

      if (data.success) {
        setOrder(data.data.order)
      } else {
        toast.error("Failed to load order", {
          description: data.message || "Order not found",
        })
      }
    } catch (error) {
      console.error("Failed to load order:", error)
      toast.error("Failed to load order")
    } finally {
      setIsLoading(false)
    }
  }

  const submitOrder = async () => {
    try {
      const response = await fetch(`/admin/printify/orders/${id}/submit`, {
        method: "POST",
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Order Submitted", {
          description: "Order submitted to Printify successfully",
        })
        loadOrder()
      } else {
        toast.error("Submit Failed", {
          description: data.message || "Failed to submit order",
        })
      }
    } catch (error) {
      console.error("Failed to submit order:", error)
      toast.error("Submit Failed", { description: "Failed to submit order" })
    }
  }

  const cancelOrder = async () => {
    try {
      const response = await fetch(`/admin/printify/orders/${id}/cancel`, {
        method: "POST",
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Order Cancelled", {
          description: "Order cancelled successfully",
        })
        loadOrder()
      } else {
        toast.error("Cancel Failed", {
          description: data.message || "Failed to cancel order",
        })
      }
    } catch (error) {
      console.error("Failed to cancel order:", error)
      toast.error("Cancel Failed", { description: "Failed to cancel order" })
    }
  }

  const syncStatus = async () => {
    try {
      const response = await fetch(`/admin/printify/orders/${id}/sync`, {
        method: "POST",
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Status Synced", {
          description: "Order status synced from Printify",
        })
        loadOrder()
      } else {
        toast.error("Sync Failed", {
          description: data.message || "Failed to sync status",
        })
      }
    } catch (error) {
      console.error("Failed to sync status:", error)
      toast.error("Sync Failed", { description: "Failed to sync status" })
    }
  }

  const formatCurrency = (amount: number, currency: string) => {
    return `$${(amount / 100).toFixed(2)} ${currency}`
  }

  if (isLoading) {
    return (
      <Container>
        <div className="flex items-center justify-center py-8">
          <Text className="text-ui-fg-subtle">Loading order...</Text>
        </div>
        <Toaster />
      </Container>
    )
  }

  if (!order) {
    return (
      <Container>
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <Text className="text-ui-fg-subtle">Order not found</Text>
          <Button variant="secondary" onClick={() => navigate("/a/printify/orders")}>
            Back to Orders
          </Button>
        </div>
        <Toaster />
      </Container>
    )
  }

  const headerActions: any[] = []
  if (SUBMITTABLE_STATUSES.includes(order.status)) {
    headerActions.push({
      type: "button",
      props: { variant: "primary", onClick: submitOrder, children: "Submit to Printify" },
    })
  }
  if (CANCELLABLE_STATUSES.includes(order.status)) {
    headerActions.push({
      type: "button",
      props: { variant: "secondary", onClick: cancelOrder, children: "Cancel Order" },
    })
  }
  if (order.printify_order_id) {
    headerActions.push({
      type: "button",
      props: { variant: "secondary", onClick: syncStatus, children: "Sync Status" },
    })
  }

  return (
    <>
      <Container>
        <Header
          title={`Order ${order.medusa_order_id || order.id}`}
          subtitle={`Created ${new Date(order.created_at).toLocaleString()}`}
          actions={headerActions}
        />

        {/* Status + IDs */}
        <div className="flex items-center gap-3 px-6 py-4">
          <StatusBadge color={STATUS_COLORS[order.status] || "grey"}>
            {order.status}
          </StatusBadge>
          {order.printify_order_id && (
            <Text size="small" className="text-ui-fg-subtle">
              Printify ID: {order.printify_order_id}
            </Text>
          )}
          <Text size="small" className="text-ui-fg-subtle">
            Customer: {order.customer_email}
          </Text>
          {order.medusa_order && (
            <StatusBadge color="blue">
              Medusa #{order.medusa_order.display_id}
            </StatusBadge>
          )}
        </div>

        {order.last_error && (
          <div className="mx-6 mb-4 rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg p-3">
            <Text size="small" className="text-ui-tag-red-text">
              Error: {order.last_error}
            </Text>
          </div>
        )}
      </Container>

      {/* Pricing Summary */}
      <Container className="mt-4">
        <div className="px-6 py-4">
          <Heading level="h3" className="mb-3">Pricing</Heading>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div>
              <Text size="small" className="text-ui-fg-subtle">Subtotal</Text>
              <Text weight="plus">{formatCurrency(order.pricing.subtotal, order.pricing.currency)}</Text>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">Shipping</Text>
              <Text weight="plus">{formatCurrency(order.pricing.shipping_cost, order.pricing.currency)}</Text>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">Tax</Text>
              <Text weight="plus">{formatCurrency(order.pricing.tax_amount, order.pricing.currency)}</Text>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">Discount</Text>
              <Text weight="plus">-{formatCurrency(order.pricing.discount_amount, order.pricing.currency)}</Text>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">Total</Text>
              <Text weight="plus" className="text-lg">{formatCurrency(order.pricing.total, order.pricing.currency)}</Text>
            </div>
          </div>
        </div>
      </Container>

      {/* Cost & Margin */}
      {order.pricing.total_cost != null && order.pricing.total_cost > 0 && (
        <Container className="mt-4">
          <div className="px-6 py-4">
            <Heading level="h3" className="mb-3">Cost & Margin</Heading>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div>
                <Text size="small" className="text-ui-fg-subtle">Production Cost</Text>
                <Text weight="plus">{formatCurrency(order.pricing.total_cost, order.pricing.currency)}</Text>
              </div>
              <div>
                <Text size="small" className="text-ui-fg-subtle">Profit</Text>
                <Text weight="plus" className={
                  (order.pricing.profit ?? 0) >= 0 ? "text-ui-tag-green-text" : "text-ui-tag-red-text"
                }>
                  {formatCurrency(order.pricing.profit ?? 0, order.pricing.currency)}
                </Text>
              </div>
              <div>
                <Text size="small" className="text-ui-fg-subtle">Margin</Text>
                <Text weight="plus" className={
                  (order.pricing.margin_percent ?? 0) >= 40
                    ? "text-ui-tag-green-text"
                    : (order.pricing.margin_percent ?? 0) >= 20
                      ? "text-ui-tag-orange-text"
                      : "text-ui-tag-red-text"
                }>
                  {(order.pricing.margin_percent ?? 0).toFixed(1)}%
                </Text>
              </div>
            </div>
            {order.pricing.cost_per_item && order.pricing.cost_per_item.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <Text size="small" weight="plus" className="mb-2">Per-Item Costs</Text>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ui-border-base">
                      <th className="py-2 font-medium text-ui-fg-subtle">Product</th>
                      <th className="py-2 font-medium text-ui-fg-subtle">Variant</th>
                      <th className="py-2 font-medium text-ui-fg-subtle">Unit Cost</th>
                      <th className="py-2 font-medium text-ui-fg-subtle">Qty</th>
                      <th className="py-2 font-medium text-ui-fg-subtle">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.pricing.cost_per_item.map((item, index) => (
                      <tr key={index} className="border-b border-ui-border-base">
                        <td className="py-2"><Text size="small">{item.printify_product_id}</Text></td>
                        <td className="py-2"><Text size="small">{item.printify_variant_id}</Text></td>
                        <td className="py-2"><Text size="small">{formatCurrency(item.unit_cost, order.pricing.currency)}</Text></td>
                        <td className="py-2"><Text size="small">{item.quantity}</Text></td>
                        <td className="py-2"><Text size="small">{formatCurrency(item.total_cost, order.pricing.currency)}</Text></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Container>
      )}

      {/* Line Items */}
      <Container className="mt-4">
        <div className="px-6 py-4">
          <Heading level="h3" className="mb-3">Items</Heading>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ui-border-base">
                  <th className="py-2 font-medium text-ui-fg-subtle">Product</th>
                  <th className="py-2 font-medium text-ui-fg-subtle">Variant</th>
                  <th className="py-2 font-medium text-ui-fg-subtle">Qty</th>
                  <th className="py-2 font-medium text-ui-fg-subtle">Unit Price</th>
                  <th className="py-2 font-medium text-ui-fg-subtle">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item, index) => (
                  <tr key={index} className="border-b border-ui-border-base">
                    <td className="py-2">
                      <Text size="small">{item.printify_product_id}</Text>
                    </td>
                    <td className="py-2">
                      <Text size="small">{item.printify_variant_id}</Text>
                    </td>
                    <td className="py-2">
                      <Text size="small">{item.quantity}</Text>
                    </td>
                    <td className="py-2">
                      <Text size="small">{formatCurrency(item.unit_price, order.pricing.currency)}</Text>
                    </td>
                    <td className="py-2">
                      <Text size="small">{formatCurrency(item.total_price, order.pricing.currency)}</Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Container>

      {/* Shipping Address */}
      {order.shipping_address && (
        <Container className="mt-4">
          <div className="px-6 py-4">
            <Heading level="h3" className="mb-3">Shipping Address</Heading>
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text size="small">
                {order.shipping_address.first_name} {order.shipping_address.last_name}
              </Text>
              {order.shipping_address.company && (
                <Text size="small">{order.shipping_address.company}</Text>
              )}
              <Text size="small">{order.shipping_address.address1}</Text>
              {order.shipping_address.address2 && (
                <Text size="small">{order.shipping_address.address2}</Text>
              )}
              <Text size="small">
                {order.shipping_address.city}
                {order.shipping_address.region ? `, ${order.shipping_address.region}` : ""}{" "}
                {order.shipping_address.zip}
              </Text>
              <Text size="small">{order.shipping_address.country}</Text>
              {order.shipping_address.phone && (
                <Text size="small" className="mt-1 text-ui-fg-subtle">
                  Phone: {order.shipping_address.phone}
                </Text>
              )}
            </div>
          </div>
        </Container>
      )}

      {/* Tracking */}
      {order.tracking && (order.tracking.number || order.tracking.url) && (
        <Container className="mt-4">
          <div className="px-6 py-4">
            <Heading level="h3" className="mb-3">Tracking</Heading>
            <div className="rounded-lg border border-ui-border-base p-4">
              {order.tracking.carrier && (
                <div className="mb-1">
                  <Text size="small" className="text-ui-fg-subtle">Carrier</Text>
                  <Text size="small">{order.tracking.carrier}</Text>
                </div>
              )}
              {order.tracking.number && (
                <div className="mb-1">
                  <Text size="small" className="text-ui-fg-subtle">Tracking Number</Text>
                  <Text size="small">{order.tracking.number}</Text>
                </div>
              )}
              {order.tracking.url && (
                <div className="mb-1">
                  <Text size="small" className="text-ui-fg-subtle">Tracking URL</Text>
                  <a
                    href={order.tracking.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-ui-fg-interactive underline"
                  >
                    {order.tracking.url}
                  </a>
                </div>
              )}
              {order.tracking.shipped_at && (
                <div>
                  <Text size="small" className="text-ui-fg-subtle">Shipped At</Text>
                  <Text size="small">
                    {new Date(order.tracking.shipped_at).toLocaleString()}
                  </Text>
                </div>
              )}
            </div>
          </div>
        </Container>
      )}

      {/* Timestamps */}
      <Container className="mt-4 mb-4">
        <div className="px-6 py-4">
          <Heading level="h3" className="mb-3">Timeline</Heading>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-ui-fg-subtle" />
              <Text size="small">
                Created: {new Date(order.created_at).toLocaleString()}
              </Text>
            </div>
            {order.submitted_at && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-ui-fg-interactive" />
                <Text size="small">
                  Submitted: {new Date(order.submitted_at).toLocaleString()}
                </Text>
              </div>
            )}
            {order.tracking?.shipped_at && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-ui-tag-purple-icon" />
                <Text size="small">
                  Shipped: {new Date(order.tracking.shipped_at).toLocaleString()}
                </Text>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-ui-fg-subtle" />
              <Text size="small">
                Last Updated: {new Date(order.updated_at).toLocaleString()}
              </Text>
            </div>
          </div>
        </div>
      </Container>

      <Toaster />
    </>
  )
}

export const config = defineRouteConfig({
  label: "Order Detail",
})

export default PrintifyOrderDetailPage
