import { useState, useEffect } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, StatusBadge, Text, toast, Toaster } from "@medusajs/ui"
import { Container } from "../../../components/container"
import { Header } from "../../../components/header"

interface SalesSummary {
  total_revenue: number
  total_orders: number
  avg_order_value: number
  total_shipping: number
  total_tax: number
  total_discounts: number
  currency: string
}

interface FulfillmentMetrics {
  orders_by_status: Record<string, number>
  avg_processing_time_hours: number
  avg_delivery_time_hours: number
  fulfillment_rate: number
}

interface TopProduct {
  printify_product_id: string
  title: string
  units_sold: number
  revenue: number
  cost: number
  margin_amount: number
  margin_pct: number
}

interface AnalyticsData {
  date_range: { from?: string; to?: string }
  sales_summary: SalesSummary
  fulfillment_metrics: FulfillmentMetrics
  top_products: TopProduct[]
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

const formatCents = (cents: number): string =>
  `$${(cents / 100).toFixed(2)}`

const PrintifyAnalyticsPage = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async (from?: string, to?: string) => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (from) params.set("date_from", from)
      if (to) params.set("date_to", to)

      const response = await fetch(`/admin/printify/analytics?${params}`)
      const data = await response.json()

      if (data.success) {
        setAnalytics(data.data)
      } else {
        toast.error("Failed to load analytics")
      }
    } catch (error) {
      console.error("Failed to load analytics:", error)
      toast.error("Failed to load analytics")
    } finally {
      setIsLoading(false)
    }
  }

  const handleApplyDateRange = () => {
    loadAnalytics(dateFrom || undefined, dateTo || undefined)
  }

  const sales = analytics?.sales_summary
  const fulfillment = analytics?.fulfillment_metrics
  const topProducts = analytics?.top_products || []

  return (
    <>
      <Container>
        <Header
          title="Printify Analytics"
          subtitle="Sales reports, fulfillment metrics, and profit margins"
        />

        {/* Date Range Filter */}
        <div className="px-6 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Text size="small" className="text-ui-fg-subtle mb-1">From</Text>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-ui-border-base rounded-md px-3 py-1.5 text-sm bg-ui-bg-field"
              />
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle mb-1">To</Text>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-ui-border-base rounded-md px-3 py-1.5 text-sm bg-ui-bg-field"
              />
            </div>
            <Button size="small" onClick={handleApplyDateRange}>
              Apply
            </Button>
          </div>
        </div>
      </Container>

      {isLoading ? (
        <Container>
          <div className="px-6 py-8 text-center">
            <Text className="text-ui-fg-subtle">Loading analytics...</Text>
          </div>
        </Container>
      ) : analytics ? (
        <>
          {/* Sales Summary Cards */}
          <Container>
            <div className="px-6 py-4">
              <Text weight="plus" size="large" className="mb-4">Sales Summary</Text>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-3">
                <StatCard label="Revenue" value={formatCents(sales?.total_revenue || 0)} />
                <StatCard label="Orders" value={String(sales?.total_orders || 0)} />
                <StatCard label="Avg Order Value" value={formatCents(sales?.avg_order_value || 0)} />
                <StatCard label="Shipping" value={formatCents(sales?.total_shipping || 0)} />
                <StatCard label="Tax" value={formatCents(sales?.total_tax || 0)} />
                <StatCard label="Discounts" value={formatCents(sales?.total_discounts || 0)} />
              </div>
            </div>
          </Container>

          {/* Fulfillment Metrics */}
          <Container>
            <div className="px-6 py-4">
              <Text weight="plus" size="large" className="mb-4">Fulfillment Metrics</Text>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                <StatCard
                  label="Fulfillment Rate"
                  value={`${Math.round((fulfillment?.fulfillment_rate || 0) * 100)}%`}
                />
                <StatCard
                  label="Avg Processing Time"
                  value={`${fulfillment?.avg_processing_time_hours || 0}h`}
                />
                <StatCard
                  label="Avg Delivery Time"
                  value={`${fulfillment?.avg_delivery_time_hours || 0}h`}
                />
                <div className="rounded-lg border border-ui-border-base p-4">
                  <Text size="small" className="text-ui-fg-subtle mb-2">Orders by Status</Text>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(fulfillment?.orders_by_status || {}).map(([status, count]) => (
                      <div key={status} className="flex items-center gap-1">
                        <StatusBadge color={STATUS_COLORS[status] || "grey"}>
                          {status}
                        </StatusBadge>
                        <Text size="small" weight="plus">{count}</Text>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Container>

          {/* Top Products Table */}
          {topProducts.length > 0 && (
            <Container>
              <div className="px-6 py-4">
                <Text weight="plus" size="large" className="mb-4">Top Products</Text>
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ui-border-base">
                        <th className="text-left py-2 px-3 text-ui-fg-subtle font-medium">Product</th>
                        <th className="text-right py-2 px-3 text-ui-fg-subtle font-medium">Units Sold</th>
                        <th className="text-right py-2 px-3 text-ui-fg-subtle font-medium">Revenue</th>
                        <th className="text-right py-2 px-3 text-ui-fg-subtle font-medium">Cost</th>
                        <th className="text-right py-2 px-3 text-ui-fg-subtle font-medium">Margin $</th>
                        <th className="text-right py-2 px-3 text-ui-fg-subtle font-medium">Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((product) => (
                        <tr key={product.printify_product_id} className="border-b border-ui-border-base">
                          <td className="py-2 px-3">
                            <Text size="small" weight="plus">{product.title}</Text>
                          </td>
                          <td className="text-right py-2 px-3">
                            <Text size="small">{product.units_sold}</Text>
                          </td>
                          <td className="text-right py-2 px-3">
                            <Text size="small">{formatCents(product.revenue)}</Text>
                          </td>
                          <td className="text-right py-2 px-3">
                            <Text size="small">{formatCents(product.cost)}</Text>
                          </td>
                          <td className="text-right py-2 px-3">
                            <Text
                              size="small"
                              className={product.margin_amount >= 0 ? "text-ui-fg-interactive" : "text-ui-fg-error"}
                            >
                              {formatCents(product.margin_amount)}
                            </Text>
                          </td>
                          <td className="text-right py-2 px-3">
                            <Text
                              size="small"
                              className={product.margin_pct >= 0 ? "text-ui-fg-interactive" : "text-ui-fg-error"}
                            >
                              {product.margin_pct}%
                            </Text>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Container>
          )}
        </>
      ) : null}

      <Toaster />
    </>
  )
}

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-ui-border-base p-4">
    <Text size="small" className="text-ui-fg-subtle">{label}</Text>
    <Text size="xlarge" weight="plus" className="mt-1">{value}</Text>
  </div>
)

export const config = defineRouteConfig({
  label: "Analytics",
})

export default PrintifyAnalyticsPage
