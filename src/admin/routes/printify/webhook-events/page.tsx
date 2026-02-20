import { useState, useEffect, useMemo } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  StatusBadge,
  toast,
  Toaster,
  createDataTableColumnHelper,
  createDataTableFilterHelper,
  DataTable,
  DataTablePaginationState,
  DataTableFilteringState,
  useDataTable,
  CommandBar,
  Text,
} from "@medusajs/ui"
import { useNavigate } from "react-router-dom"
import { Container } from "../../../components/container"
import { Header } from "../../../components/header"
import { ActionMenu } from "../../../components/action-menu"
import {
  Eye,
  ArrowPath,
  Trash,
} from "@medusajs/icons"

interface WebhookEvent {
  id: string
  configuration_id: string
  event_type: string
  processing_status: string
  processing_error?: string
  received_at: string
  processed_at?: string
}

const STATUS_COLORS: Record<string, "green" | "red" | "blue" | "grey"> = {
  success: "green",
  failed: "red",
  replayed: "blue",
}

const EVENT_TYPES = [
  "order:status-changed",
  "order:shipped",
  "order:sent-to-production",
  "order:shipment:delivered",
  "product:updated",
  "product:deleted",
  "shop:disconnected",
]

const columnHelper = createDataTableColumnHelper<WebhookEvent>()

const filterHelper = createDataTableFilterHelper<WebhookEvent>()

const filters = [
  filterHelper.accessor("event_type", {
    type: "select",
    label: "Event Type",
    options: EVENT_TYPES.map((t) => ({ label: t, value: t })),
  }),
  filterHelper.accessor("processing_status", {
    type: "select",
    label: "Status",
    options: [
      { label: "Success", value: "success" },
      { label: "Failed", value: "failed" },
      { label: "Replayed", value: "replayed" },
    ],
  }),
]

const PrintifyWebhookEventsPage = () => {
  const navigate = useNavigate()
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set())
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageSize: 20,
    pageIndex: 0,
  })
  const [filtering, setFiltering] = useState<DataTableFilteringState>({})
  const [rowCount, setRowCount] = useState(0)

  const eventTypeFilter = useMemo(() => {
    const v = filtering.event_type as string[] | undefined
    return v && v.length > 0 ? v : undefined
  }, [filtering])

  const statusFilter = useMemo(() => {
    const v = filtering.processing_status as string[] | undefined
    return v && v.length > 0 ? v : undefined
  }, [filtering])

  useEffect(() => {
    loadEvents()
  }, [pagination.pageIndex, eventTypeFilter, statusFilter])

  const loadEvents = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        offset: (pagination.pageIndex * pagination.pageSize).toString(),
        limit: pagination.pageSize.toString(),
      })

      if (eventTypeFilter && eventTypeFilter[0]) {
        params.set("event_type", eventTypeFilter[0] as string)
      }
      if (statusFilter && statusFilter[0]) {
        params.set("processing_status", statusFilter[0] as string)
      }

      const response = await fetch(`/admin/printify/webhook-events?${params}`)
      const data = await response.json()

      if (data.success) {
        setEvents(data.data.events)
        setRowCount(data.data.total)
      } else {
        toast.error("Failed to load webhook events")
      }
    } catch (error) {
      console.error("Failed to load webhook events:", error)
      toast.error("Failed to load webhook events")
    } finally {
      setIsLoading(false)
    }
  }

  const replayEvent = async (eventId: string) => {
    if (!confirm("Replay this webhook event? It will be re-processed.")) return

    try {
      const response = await fetch(`/admin/printify/webhook-events/${eventId}/replay`, {
        method: "POST",
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Event Replayed", {
          description: "Webhook event replayed successfully",
        })
        loadEvents()
      } else {
        toast.error("Replay Failed", {
          description: data.message || "Failed to replay event",
        })
      }
    } catch (error) {
      console.error("Failed to replay event:", error)
      toast.error("Replay Failed", { description: "Failed to replay event" })
    }
  }

  const deleteEvent = async (eventId: string) => {
    if (!confirm("Delete this webhook event? This cannot be undone.")) return

    try {
      const response = await fetch(`/admin/printify/webhook-events/${eventId}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Event Deleted", {
          description: "Webhook event deleted successfully",
        })
        loadEvents()
      } else {
        toast.error("Delete Failed", {
          description: data.message || "Failed to delete event",
        })
      }
    } catch (error) {
      console.error("Failed to delete event:", error)
      toast.error("Delete Failed", { description: "Failed to delete event" })
    }
  }

  const bulkDeleteEvents = async () => {
    if (selectedEvents.size === 0) return
    if (!confirm(`Delete ${selectedEvents.size} webhook event(s)? This cannot be undone.`)) return

    try {
      const promises = Array.from(selectedEvents).map((id) =>
        fetch(`/admin/printify/webhook-events/${id}`, { method: "DELETE" })
      )
      const results = await Promise.allSettled(promises)
      const succeeded = results.filter((r) => r.status === "fulfilled").length
      const failed = results.length - succeeded

      if (failed === 0) {
        toast.success("Bulk Delete Completed", {
          description: `${succeeded} event(s) deleted`,
        })
      } else {
        toast.warning("Bulk Delete Partial", {
          description: `${succeeded} deleted, ${failed} failed`,
        })
      }

      setSelectedEvents(new Set())
      loadEvents()
    } catch (error) {
      console.error("Failed to bulk delete events:", error)
      toast.error("Bulk Delete Failed", { description: "Failed to delete events" })
    }
  }

  const eventColumns = useMemo(
    () => [
      columnHelper.accessor("event_type", {
        header: "Event Type",
        cell: ({ row }) => (
          <Text
            weight="plus"
            size="small"
            className="text-ui-fg-interactive cursor-pointer"
            onClick={() => navigate(`/a/printify/webhook-events/${row.original.id}`)}
          >
            {row.original.event_type}
          </Text>
        ),
      }),
      columnHelper.accessor("processing_status", {
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge color={STATUS_COLORS[row.original.processing_status] || "grey"}>
            {row.original.processing_status}
          </StatusBadge>
        ),
      }),
      columnHelper.accessor("configuration_id", {
        header: "Config ID",
        cell: ({ row }) => (
          <Text size="small" className="text-ui-fg-subtle">
            {row.original.configuration_id.substring(0, 12)}...
          </Text>
        ),
      }),
      columnHelper.accessor("received_at", {
        header: "Received",
        cell: ({ row }) => (
          <Text size="small" className="text-ui-fg-subtle">
            {new Date(row.original.received_at).toLocaleString()}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "processed_at",
        header: "Processed",
        cell: ({ row }) => (
          <Text size="small" className="text-ui-fg-subtle">
            {row.original.processed_at
              ? new Date(row.original.processed_at).toLocaleString()
              : "-"}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const event = row.original
          const actions = []

          actions.push({
            icon: <Eye />,
            label: "View Details",
            onClick: () => navigate(`/a/printify/webhook-events/${event.id}`),
          })

          if (event.processing_status === "failed") {
            actions.push({
              icon: <ArrowPath />,
              label: "Replay",
              onClick: () => replayEvent(event.id),
            })
          }

          actions.push({
            icon: <Trash />,
            label: "Delete",
            onClick: () => deleteEvent(event.id),
          })

          return <ActionMenu groups={[{ actions }]} />
        },
      }),
    ],
    [navigate]
  )

  const table = useDataTable({
    columns: eventColumns,
    data: events,
    getRowId: (row) => row.id,
    rowCount,
    isLoading,
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
    filtering: {
      state: filtering,
      onFilteringChange: setFiltering,
    },
    filters,
    rowSelection: {
      state: Object.fromEntries(
        Array.from(selectedEvents).map((id) => [id, true])
      ),
      onRowSelectionChange: (updater: any) => {
        const newSelection =
          typeof updater === "function"
            ? updater(
                Object.fromEntries(
                  Array.from(selectedEvents).map((id) => [id, true])
                )
              )
            : updater

        setSelectedEvents(
          new Set(Object.keys(newSelection).filter((key) => newSelection[key]))
        )
      },
    },
  })

  return (
    <>
      <Container>
        <Header
          title="Webhook Events"
          subtitle="Browse and inspect inbound Printify webhook events"
        />

        <div className="px-6 py-4">
          <DataTable instance={table}>
            <DataTable.Toolbar className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
              <div className="flex gap-2">
                <DataTable.FilterMenu tooltip="Filter events" />
              </div>
            </DataTable.Toolbar>
            <DataTable.Table />
            <DataTable.Pagination />
          </DataTable>
        </div>
      </Container>

      <CommandBar open={selectedEvents.size > 0}>
        <CommandBar.Bar>
          <CommandBar.Value>{selectedEvents.size} selected</CommandBar.Value>
          <CommandBar.Seperator />
          <CommandBar.Command
            action={bulkDeleteEvents}
            label="Delete Selected"
            shortcut="d"
          />
          <CommandBar.Seperator />
          <CommandBar.Command
            action={() => setSelectedEvents(new Set())}
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
  label: "Webhook Events",
})

export default PrintifyWebhookEventsPage
