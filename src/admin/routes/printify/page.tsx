import { useState, useEffect } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Switch,
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

interface AutomationStatus {
  configuration: {
    sync_enabled: boolean
    sync_frequency: number
    auto_submit_orders: boolean
  }
  product_sync: {
    last_sync_at?: string
    last_sync_status: string
    last_sync_duration_ms?: number
    products_synced: number
    products_failed: number
    error_message?: string
  }
  order_auto_submit: {
    last_run_at?: string
    last_run_status: string
    orders_submitted: number
    orders_failed: number
    error_message?: string
  }
  updated_at: string
}

const ACTIVITY_STATUS_COLORS: Record<string, "green" | "blue" | "red" | "grey"> = {
  success: "green",
  running: "blue",
  failed: "red",
  idle: "grey",
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "Never"
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

const AutomationActivityWidget = () => {
  const [automation, setAutomation] = useState<AutomationStatus | null>(null)
  const [isToggling, setIsToggling] = useState(false)

  const loadAutomationStatus = async () => {
    try {
      const res = await fetch("/admin/printify/automation/status")
      const data = await res.json()
      if (data.success) {
        setAutomation(data.data)
      }
    } catch {
      // Silently fail — dashboard still works without this widget
    }
  }

  useEffect(() => {
    loadAutomationStatus()
    const interval = setInterval(loadAutomationStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleToggle = async (field: "sync_enabled" | "auto_submit_orders", value: boolean) => {
    setIsToggling(true)
    try {
      const res = await fetch("/admin/printify/automation/toggle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      const data = await res.json()
      if (data.success) {
        setAutomation((prev) =>
          prev ? { ...prev, configuration: { ...prev.configuration, [field]: value } } : prev
        )
        toast.success(`${field === "sync_enabled" ? "Product sync" : "Order auto-submit"} ${value ? "enabled" : "disabled"}`)
      } else {
        toast.error("Failed to update setting")
      }
    } catch {
      toast.error("Failed to update setting")
    } finally {
      setIsToggling(false)
    }
  }

  if (!automation) return null

  return (
    <Container className="mt-4">
      <Header title="Automation Activity" subtitle="Scheduled job status and controls" />
      <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
        {/* Product Sync Card */}
        <div className="rounded-lg border border-ui-border-base p-4">
          <div className="flex items-center justify-between mb-3">
            <Heading level="h3">Product Sync</Heading>
            <Switch
              checked={automation.configuration.sync_enabled}
              onCheckedChange={(checked) => handleToggle("sync_enabled", checked)}
              disabled={isToggling}
            />
          </div>
          {automation.configuration.sync_enabled && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Text size="small" className="text-ui-fg-subtle">Last run</Text>
                <Text size="small">{formatRelativeTime(automation.product_sync.last_sync_at)}</Text>
              </div>
              <div className="flex items-center justify-between">
                <Text size="small" className="text-ui-fg-subtle">Status</Text>
                <StatusBadge color={ACTIVITY_STATUS_COLORS[automation.product_sync.last_sync_status] || "grey"}>
                  {automation.product_sync.last_sync_status}
                </StatusBadge>
              </div>
              <div className="flex items-center justify-between">
                <Text size="small" className="text-ui-fg-subtle">Products synced</Text>
                <Text size="small">{automation.product_sync.products_synced}</Text>
              </div>
              {automation.product_sync.products_failed > 0 && (
                <div className="flex items-center justify-between">
                  <Text size="small" className="text-ui-fg-subtle">Failed</Text>
                  <Text size="small" className="text-ui-tag-red-text">{automation.product_sync.products_failed}</Text>
                </div>
              )}
              {automation.product_sync.error_message && (
                <div className="rounded bg-ui-tag-red-bg p-2 mt-2">
                  <Text size="xsmall" className="text-ui-tag-red-text">{automation.product_sync.error_message}</Text>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Order Auto-Submit Card */}
        <div className="rounded-lg border border-ui-border-base p-4">
          <div className="flex items-center justify-between mb-3">
            <Heading level="h3">Order Auto-Submit</Heading>
            <Switch
              checked={automation.configuration.auto_submit_orders}
              onCheckedChange={(checked) => handleToggle("auto_submit_orders", checked)}
              disabled={isToggling}
            />
          </div>
          {automation.configuration.auto_submit_orders && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Text size="small" className="text-ui-fg-subtle">Last run</Text>
                <Text size="small">{formatRelativeTime(automation.order_auto_submit.last_run_at)}</Text>
              </div>
              <div className="flex items-center justify-between">
                <Text size="small" className="text-ui-fg-subtle">Status</Text>
                <StatusBadge color={ACTIVITY_STATUS_COLORS[automation.order_auto_submit.last_run_status] || "grey"}>
                  {automation.order_auto_submit.last_run_status}
                </StatusBadge>
              </div>
              <div className="flex items-center justify-between">
                <Text size="small" className="text-ui-fg-subtle">Orders submitted</Text>
                <Text size="small">{automation.order_auto_submit.orders_submitted}</Text>
              </div>
              {automation.order_auto_submit.orders_failed > 0 && (
                <div className="flex items-center justify-between">
                  <Text size="small" className="text-ui-fg-subtle">Failed</Text>
                  <Text size="small" className="text-ui-tag-red-text">{automation.order_auto_submit.orders_failed}</Text>
                </div>
              )}
              {automation.order_auto_submit.error_message && (
                <div className="rounded bg-ui-tag-red-bg p-2 mt-2">
                  <Text size="xsmall" className="text-ui-tag-red-text">{automation.order_auto_submit.error_message}</Text>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Container>
  )
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

      {/* Automation Activity */}
      <AutomationActivityWidget />

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
