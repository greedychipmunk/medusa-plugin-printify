import { useState, useEffect } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  StatusBadge,
  Text,
  Heading,
  toast,
  Toaster,
} from "@medusajs/ui"
import { useNavigate } from "react-router-dom"
import { Container } from "../../components/container"
import { Header } from "../../components/header"

interface OrderStats {
  total_orders: number
  pending_orders: number
  processing_orders: number
  shipped_orders: number
  delivered_orders: number
  cancelled_orders: number
  failed_orders: number
  total_value: number
  currency: string
}

interface RecentOrder {
  id: string
  medusa_order_id: string
  status: string
  customer_email: string
  total_amount: number
  currency: string
  created_at: string
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

const PrintifyDashboard = () => {
  const navigate = useNavigate()
  const [stats, setStats] = useState<OrderStats | null>(null)
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setIsLoading(true)
      const [statsRes, ordersRes] = await Promise.all([
        fetch("/admin/printify/orders/stats"),
        fetch("/admin/printify/orders?limit=5&sort_order=desc&sort_by=createdAt"),
      ])

      const statsData = await statsRes.json()
      if (statsData.success) {
        setStats(statsData.data.stats)
      }

      const ordersData = await ordersRes.json()
      if (ordersData.success) {
        setRecentOrders(ordersData.data.orders)
      }
    } catch (error) {
      console.error("Failed to load dashboard data:", error)
      toast.error("Failed to load dashboard data")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <Container>
        <div className="flex items-center justify-center py-8">
          <Text className="text-ui-fg-subtle">Loading dashboard...</Text>
        </div>
        <Toaster />
      </Container>
    )
  }

  return (
    <>
      <Container>
        <Header
          title="Printify Dashboard"
          subtitle="Overview of your print-on-demand operations"
        />

        {/* Stat Cards */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 px-6 py-4 md:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-2xl font-bold">{stats.total_orders}</Text>
              <Text size="small" className="text-ui-fg-subtle">Total Orders</Text>
            </div>
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-2xl font-bold text-ui-fg-subtle">{stats.pending_orders}</Text>
              <Text size="small" className="text-ui-fg-subtle">Pending</Text>
            </div>
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-2xl font-bold text-ui-tag-orange-text">{stats.processing_orders}</Text>
              <Text size="small" className="text-ui-fg-subtle">Processing</Text>
            </div>
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-2xl font-bold text-ui-tag-purple-text">{stats.shipped_orders}</Text>
              <Text size="small" className="text-ui-fg-subtle">Shipped</Text>
            </div>
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-2xl font-bold text-ui-fg-interactive">{stats.delivered_orders}</Text>
              <Text size="small" className="text-ui-fg-subtle">Delivered</Text>
            </div>
            <div className="rounded-lg border border-ui-border-base p-4">
              <Text className="text-2xl font-bold text-ui-tag-red-text">{stats.failed_orders}</Text>
              <Text size="small" className="text-ui-fg-subtle">Failed</Text>
            </div>
          </div>
        )}
      </Container>

      {/* Recent Orders */}
      <Container className="mt-4">
        <Header title="Recent Orders" subtitle="Latest 5 orders" />
        <div className="px-6 py-4">
          {recentOrders.length === 0 ? (
            <Text className="text-ui-fg-subtle py-4 text-center">No orders yet</Text>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-lg border border-ui-border-base p-3 cursor-pointer hover:bg-ui-bg-subtle-hover"
                  onClick={() => navigate(`/a/printify/orders/${order.id}`)}
                >
                  <div className="flex flex-col gap-1">
                    <Text weight="plus" size="small">
                      {order.medusa_order_id || order.id}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {order.customer_email}
                    </Text>
                  </div>
                  <div className="flex items-center gap-3">
                    <Text size="small">
                      ${(order.total_amount / 100).toFixed(2)} {order.currency}
                    </Text>
                    <StatusBadge color={STATUS_COLORS[order.status] || "grey"}>
                      {order.status}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Container>

      {/* Quick Actions */}
      <Container className="mt-4">
        <Header title="Quick Actions" />
        <div className="flex gap-3 px-6 py-4">
          <Button variant="secondary" onClick={() => navigate("/a/printify/products")}>
            Sync Products
          </Button>
          <Button variant="secondary" onClick={() => navigate("/a/printify/orders")}>
            View All Orders
          </Button>
          <Button variant="secondary" onClick={() => navigate("/a/printify/settings")}>
            Settings
          </Button>
        </div>
      </Container>

      <Toaster />
    </>
  )
}

export const config = defineRouteConfig({
  label: "Printify",
})

export default PrintifyDashboard
