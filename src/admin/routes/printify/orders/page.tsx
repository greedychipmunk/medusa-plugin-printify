import { useState, useEffect, useMemo } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  StatusBadge,
  toast,
  Toaster,
  createDataTableColumnHelper,
  createDataTableFilterHelper,
  DataTable,
  DataTablePaginationState,
  DataTableFilteringState,
  DataTableSortingState,
  useDataTable,
  CommandBar,
  Text,
} from "@medusajs/ui"
import { useNavigate } from "react-router-dom"
import { Container } from "../../../components/container"
import { Header } from "../../../components/header"
import { ActionMenu } from "../../../components/action-menu"
import {
  EllipsisHorizontal,
  Eye,
  ArrowUpRightOnBox,
  XCircle,
  ArrowPath,
} from "@medusajs/icons"

interface PrintifyOrder {
  id: string
  medusa_order_id: string
  printify_order_id?: string
  status: string
  customer_email: string
  total_amount: number
  total_cost: number
  margin_percent: number
  currency: string
  created_at: string
  updated_at: string
  last_error?: string
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
const RETRYABLE_STATUSES = ["failed"]

const columnHelper = createDataTableColumnHelper<PrintifyOrder>()

const filterHelper = createDataTableFilterHelper<PrintifyOrder>()

const statusFilters = [
  filterHelper.accessor("status", {
    type: "select",
    label: "Status",
    options: [
      { label: "Pending", value: "pending" },
      { label: "Submitted", value: "submitted" },
      { label: "Processing", value: "processing" },
      { label: "Shipped", value: "shipped" },
      { label: "Delivered", value: "delivered" },
      { label: "Cancelled", value: "cancelled" },
      { label: "Failed", value: "failed" },
    ],
  }),
]

const PrintifyOrdersPage = () => {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<PrintifyOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageSize: 20,
    pageIndex: 0,
  })
  const [filtering, setFiltering] = useState<DataTableFilteringState>({})
  const [sorting, setSorting] = useState<DataTableSortingState | null>(null)
  const [rowCount, setRowCount] = useState(0)

  const statusFilter = useMemo(() => {
    const filterValue = filtering.status as string[] | undefined
    if (!filterValue || filterValue.length === 0) return undefined
    return filterValue
  }, [filtering])

  useEffect(() => {
    loadOrders()
  }, [pagination.pageIndex, searchTerm, statusFilter])

  // Compute which bulk actions are available based on selected orders' statuses
  const bulkActions = useMemo(() => {
    const selectedOrdersList = orders.filter((o) => selectedOrders.has(o.id))
    return {
      canSubmit: selectedOrdersList.some((o) => SUBMITTABLE_STATUSES.includes(o.status)),
      canCancel: selectedOrdersList.some((o) => CANCELLABLE_STATUSES.includes(o.status)),
      canRetry: selectedOrdersList.some((o) => RETRYABLE_STATUSES.includes(o.status)),
    }
  }, [selectedOrders, orders])

  const loadOrders = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        offset: (pagination.pageIndex * pagination.pageSize).toString(),
        limit: pagination.pageSize.toString(),
      })

      if (statusFilter && statusFilter.length > 0) {
        statusFilter.forEach((s) => params.append("status", s))
      }

      const response = await fetch(`/admin/printify/orders?${params}`)
      const data = await response.json()

      if (data.success) {
        setOrders(data.data.orders)
        setRowCount(data.data.count)
      } else {
        toast.error("Failed to load orders")
      }
    } catch (error) {
      console.error("Failed to load orders:", error)
      toast.error("Failed to load orders")
    } finally {
      setIsLoading(false)
    }
  }

  const submitOrder = async (orderId: string) => {
    try {
      const response = await fetch(`/admin/printify/orders/${orderId}/submit`, {
        method: "POST",
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Order Submitted", {
          description: "Order submitted to Printify successfully",
        })
        loadOrders()
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

  const cancelOrder = async (orderId: string) => {
    try {
      const response = await fetch(`/admin/printify/orders/${orderId}/cancel`, {
        method: "POST",
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Order Cancelled", {
          description: "Order cancelled successfully",
        })
        loadOrders()
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

  const syncOrderStatus = async (orderId: string) => {
    try {
      const response = await fetch(`/admin/printify/orders/${orderId}/sync`, {
        method: "POST",
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Status Synced", {
          description: "Order status synced from Printify",
        })
        loadOrders()
      } else {
        toast.error("Sync Failed", {
          description: data.message || "Failed to sync order status",
        })
      }
    } catch (error) {
      console.error("Failed to sync order status:", error)
      toast.error("Sync Failed", { description: "Failed to sync order status" })
    }
  }

  const bulkSubmitOrders = async () => {
    if (selectedOrders.size === 0) return

    try {
      const response = await fetch("/admin/printify/orders/bulk-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: Array.from(selectedOrders) }),
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Bulk Submit Completed", {
          description: `${data.data.success_count} submitted, ${data.data.failure_count} failed`,
        })
        setSelectedOrders(new Set())
        loadOrders()
      } else {
        toast.error("Bulk Submit Failed", {
          description: data.message || "Failed to submit orders",
        })
      }
    } catch (error) {
      console.error("Failed to bulk submit orders:", error)
      toast.error("Bulk Submit Failed", { description: "Failed to submit orders" })
    }
  }

  const bulkCancelOrders = async () => {
    if (selectedOrders.size === 0) return

    try {
      const response = await fetch("/admin/printify/orders/bulk-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_ids: Array.from(selectedOrders),
          reason: "Bulk cancel from admin panel",
        }),
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Bulk Cancel Completed", {
          description: `${data.data.success_count} cancelled, ${data.data.failure_count} failed`,
        })
        setSelectedOrders(new Set())
        loadOrders()
      } else {
        toast.error("Bulk Cancel Failed", {
          description: data.message || "Failed to cancel orders",
        })
      }
    } catch (error) {
      console.error("Failed to bulk cancel orders:", error)
      toast.error("Bulk Cancel Failed", { description: "Failed to cancel orders" })
    }
  }

  const bulkRetryOrders = async () => {
    if (selectedOrders.size === 0) return

    try {
      const response = await fetch("/admin/printify/orders/bulk-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: Array.from(selectedOrders) }),
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Bulk Retry Completed", {
          description: `${data.data.success_count} retried, ${data.data.failure_count} failed`,
        })
        setSelectedOrders(new Set())
        loadOrders()
      } else {
        toast.error("Bulk Retry Failed", {
          description: data.message || "Failed to retry orders",
        })
      }
    } catch (error) {
      console.error("Failed to bulk retry orders:", error)
      toast.error("Bulk Retry Failed", { description: "Failed to retry orders" })
    }
  }

  const orderColumns = useMemo(
    () => [
      columnHelper.accessor("medusa_order_id", {
        header: "Order ID",
        cell: ({ row }) => (
          <Text
            weight="plus"
            size="small"
            className="text-ui-fg-interactive cursor-pointer"
            onClick={() => navigate(`/a/printify/orders/${row.original.id}`)}
          >
            {row.original.medusa_order_id || row.original.id}
          </Text>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge color={STATUS_COLORS[row.original.status] || "grey"}>
            {row.original.status}
          </StatusBadge>
        ),
      }),
      columnHelper.accessor("customer_email", {
        header: "Customer",
        cell: ({ row }) => (
          <Text size="small">{row.original.customer_email}</Text>
        ),
      }),
      columnHelper.accessor("total_amount", {
        header: "Total",
        cell: ({ row }) => (
          <Text size="small">
            ${(row.original.total_amount / 100).toFixed(2)} {row.original.currency}
          </Text>
        ),
      }),
      columnHelper.accessor("margin_percent", {
        header: "Margin",
        cell: ({ row }) => {
          const margin = row.original.margin_percent
          const cost = row.original.total_cost
          if (!cost || cost === 0) {
            return <Text size="small" className="text-ui-fg-muted">N/A</Text>
          }
          const colorClass = margin >= 40
            ? "text-ui-tag-green-text"
            : margin >= 20
              ? "text-ui-tag-orange-text"
              : "text-ui-tag-red-text"
          return (
            <Text size="small" className={colorClass}>
              {margin.toFixed(1)}%
            </Text>
          )
        },
      }),
      columnHelper.accessor("created_at", {
        header: "Created",
        cell: ({ row }) => (
          <Text size="small" className="text-ui-fg-subtle">
            {new Date(row.original.created_at).toLocaleDateString()}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const order = row.original
          const actions = []

          actions.push({
            icon: <Eye />,
            label: "View Detail",
            onClick: () => navigate(`/a/printify/orders/${order.id}`),
          })

          if (SUBMITTABLE_STATUSES.includes(order.status)) {
            actions.push({
              icon: <ArrowUpRightOnBox />,
              label: "Submit to Printify",
              onClick: () => submitOrder(order.id),
            })
          }

          if (CANCELLABLE_STATUSES.includes(order.status)) {
            actions.push({
              icon: <XCircle />,
              label: "Cancel",
              onClick: () => cancelOrder(order.id),
            })
          }

          if (order.printify_order_id) {
            actions.push({
              icon: <ArrowPath />,
              label: "Sync Status",
              onClick: () => syncOrderStatus(order.id),
            })
          }

          return <ActionMenu groups={[{ actions }]} />
        },
      }),
    ],
    [navigate]
  )

  const table = useDataTable({
    columns: orderColumns,
    data: orders,
    getRowId: (row) => row.id,
    rowCount,
    isLoading,
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
    search: {
      state: searchTerm,
      onSearchChange: setSearchTerm,
    },
    filtering: {
      state: filtering,
      onFilteringChange: setFiltering,
    },
    filters: statusFilters,
    sorting: {
      state: sorting,
      onSortingChange: setSorting,
    },
    rowSelection: {
      state: Object.fromEntries(
        Array.from(selectedOrders).map((id) => [id, true])
      ),
      onRowSelectionChange: (updater: any) => {
        const newSelection =
          typeof updater === "function"
            ? updater(
                Object.fromEntries(
                  Array.from(selectedOrders).map((id) => [id, true])
                )
              )
            : updater

        setSelectedOrders(
          new Set(Object.keys(newSelection).filter((key) => newSelection[key]))
        )
      },
    },
  })

  return (
    <>
      <Container>
        <Header
          title="Printify Orders"
          subtitle="Manage orders submitted to Printify for fulfillment"
        />

        <div className="px-6 py-4">
          <DataTable instance={table}>
            <DataTable.Toolbar className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
              <div className="flex gap-2">
                <DataTable.FilterMenu tooltip="Filter by status" />
                <DataTable.Search placeholder="Search orders..." />
              </div>
            </DataTable.Toolbar>
            <DataTable.Table />
            <DataTable.Pagination />
          </DataTable>
        </div>
      </Container>

      {/* Command Bar for Bulk Actions */}
      <CommandBar open={selectedOrders.size > 0}>
        <CommandBar.Bar>
          <CommandBar.Value>{selectedOrders.size} selected</CommandBar.Value>
          <CommandBar.Seperator />
          {bulkActions.canSubmit && (
            <>
              <CommandBar.Command
                action={bulkSubmitOrders}
                label="Submit Selected"
                shortcut="s"
              />
              <CommandBar.Seperator />
            </>
          )}
          {bulkActions.canCancel && (
            <>
              <CommandBar.Command
                action={bulkCancelOrders}
                label="Cancel Selected"
                shortcut="x"
              />
              <CommandBar.Seperator />
            </>
          )}
          {bulkActions.canRetry && (
            <>
              <CommandBar.Command
                action={bulkRetryOrders}
                label="Retry Selected"
                shortcut="r"
              />
              <CommandBar.Seperator />
            </>
          )}
          <CommandBar.Command
            action={() => setSelectedOrders(new Set())}
            label="Clear Selection"
            shortcut="c"
          />
        </CommandBar.Bar>
      </CommandBar>

      <Toaster />
    </>
  )
}

export const config = defineRouteConfig({
  label: "Orders",
})

export default PrintifyOrdersPage
