import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Badge, Button } from "@medusajs/ui"
import { useEffect, useState } from "react"

type PrintifyOrder = {
  id: string
  printify_id: string | null
  status: string
  total_cost: number | null
  submitted_at: string | null
}

type WidgetProps = {
  data: { id: string }
}

const PrintifyOrderWidget = ({ data }: WidgetProps) => {
  const [printifyOrders, setPrintifyOrders] = useState<PrintifyOrder[]>([])
  const [submitting, setSubmitting] = useState(false)

  const loadOrders = async () => {
    const res = await fetch(
      `/admin/printify/orders?medusa_order_id=${data.id}`,
      { credentials: "include" }
    )
    const json = await res.json()
    setPrintifyOrders(json.orders ?? [])
  }

  const submitOrder = async (orderId: string) => {
    setSubmitting(true)
    try {
      await fetch(`/admin/printify/orders/${orderId}/submit`, {
        method: "POST",
        credentials: "include",
      })
      await loadOrders()
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => { loadOrders() }, [data.id])

  if (printifyOrders.length === 0) return null

  return (
    <Container className="p-4">
      <Heading className="mb-3" level="h2">Printify Fulfillment</Heading>
      {printifyOrders.map(order => (
        <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
          <div>
            <Text size="small" className="font-medium">
              {order.printify_id ?? "Not yet submitted"}
            </Text>
            <Badge
              color={
                order.status === "shipped" ? "green"
                : order.status === "in-production" ? "blue"
                : order.status === "pending" ? "orange"
                : "grey"
              }
              size="2xsmall"
              className="mt-1"
            >
              {order.status}
            </Badge>
          </div>
          {order.status === "pending" && (
            <Button
              size="small"
              variant="secondary"
              onClick={() => submitOrder(order.id)}
              isLoading={submitting}
            >
              Submit to Printify
            </Button>
          )}
          {order.total_cost && (
            <Text size="small" className="text-ui-fg-muted">
              Cost: ${(order.total_cost / 100).toFixed(2)}
            </Text>
          )}
        </div>
      ))}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default PrintifyOrderWidget
