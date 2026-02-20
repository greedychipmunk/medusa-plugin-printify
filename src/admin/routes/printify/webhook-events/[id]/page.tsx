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

interface WebhookEventDetail {
  id: string
  configuration_id: string
  event_type: string
  payload: Record<string, unknown>
  signature?: string
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

const PrintifyWebhookEventDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [event, setEvent] = useState<WebhookEventDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (id) {
      loadEvent()
    }
  }, [id])

  const loadEvent = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/admin/printify/webhook-events/${id}`)
      const data = await response.json()

      if (data.success) {
        setEvent(data.data.event)
      } else {
        toast.error("Failed to load event", {
          description: data.message || "Event not found",
        })
      }
    } catch (error) {
      console.error("Failed to load webhook event:", error)
      toast.error("Failed to load event")
    } finally {
      setIsLoading(false)
    }
  }

  const replayEvent = async () => {
    if (!confirm("Replay this webhook event? It will be re-processed.")) return

    try {
      const response = await fetch(`/admin/printify/webhook-events/${id}/replay`, {
        method: "POST",
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Event Replayed", {
          description: "Webhook event replayed successfully",
        })
        loadEvent()
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

  const deleteEvent = async () => {
    if (!confirm("Delete this webhook event? This cannot be undone.")) return

    try {
      const response = await fetch(`/admin/printify/webhook-events/${id}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Event Deleted", {
          description: "Webhook event deleted successfully",
        })
        navigate("/a/printify/webhook-events")
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

  if (isLoading) {
    return (
      <Container>
        <div className="flex items-center justify-center py-8">
          <Text className="text-ui-fg-subtle">Loading event...</Text>
        </div>
        <Toaster />
      </Container>
    )
  }

  if (!event) {
    return (
      <Container>
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <Text className="text-ui-fg-subtle">Webhook event not found</Text>
          <Button variant="secondary" onClick={() => navigate("/a/printify/webhook-events")}>
            Back to Webhook Events
          </Button>
        </div>
        <Toaster />
      </Container>
    )
  }

  const headerActions: any[] = []
  if (event.processing_status === "failed") {
    headerActions.push({
      type: "button",
      props: { variant: "primary", onClick: replayEvent, children: "Replay Event" },
    })
  }
  headerActions.push({
    type: "button",
    props: { variant: "secondary", onClick: deleteEvent, children: "Delete" },
  })

  return (
    <>
      <Container>
        <Header
          title={event.event_type}
          subtitle={`Received ${new Date(event.received_at).toLocaleString()}`}
          actions={[
            {
              type: "button",
              props: {
                variant: "secondary",
                onClick: () => navigate("/a/printify/webhook-events"),
                children: "Back",
              },
            },
            ...headerActions,
          ]}
        />

        {/* Status + Event Info */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div>
              <Text size="small" className="text-ui-fg-subtle">Event ID</Text>
              <Text size="small" className="font-mono">{event.id}</Text>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">Configuration ID</Text>
              <Text size="small" className="font-mono">{event.configuration_id}</Text>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">Processing Status</Text>
              <div className="mt-1">
                <StatusBadge color={STATUS_COLORS[event.processing_status] || "grey"}>
                  {event.processing_status}
                </StatusBadge>
              </div>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">Received At</Text>
              <Text size="small">{new Date(event.received_at).toLocaleString()}</Text>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">Processed At</Text>
              <Text size="small">
                {event.processed_at ? new Date(event.processed_at).toLocaleString() : "-"}
              </Text>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">Event Type</Text>
              <Text size="small">{event.event_type}</Text>
            </div>
          </div>
        </div>

        {/* Processing Error */}
        {event.processing_error && (
          <div className="px-6 pb-4">
            <div className="rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg p-3">
              <Text size="small" className="text-ui-fg-subtle mb-1">Processing Error</Text>
              <Text size="small" className="text-ui-tag-red-text">
                {event.processing_error}
              </Text>
            </div>
          </div>
        )}
      </Container>

      {/* Payload */}
      <Container className="mt-4 mb-4">
        <div className="px-6 py-4">
          <Heading level="h3" className="mb-3">Payload</Heading>
          <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 overflow-auto max-h-[600px]">
            <pre className="text-xs font-mono text-ui-fg-base whitespace-pre-wrap break-words">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        </div>
      </Container>

      <Toaster />
    </>
  )
}

export const config = defineRouteConfig({
  label: "Webhook Event Detail",
})

export default PrintifyWebhookEventDetailPage
