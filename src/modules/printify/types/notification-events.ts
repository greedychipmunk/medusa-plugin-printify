/**
 * Notification Event Types & Payload Interfaces
 *
 * Defines event bus event names and structured payloads for
 * Printify plugin notifications (dead-lettered orders, sync failures, webhook errors).
 */

export const PRINTIFY_EVENTS = {
  ORDER_DEAD_LETTERED: "printify.order.dead_lettered",
  SYNC_FAILED: "printify.sync.failed",
  WEBHOOK_FAILED: "printify.webhook.failed",
} as const

export type PrintifyEventName = (typeof PRINTIFY_EVENTS)[keyof typeof PRINTIFY_EVENTS]

export interface BaseNotificationPayload {
  event_type: PrintifyEventName
  configuration_id: string
  notification_emails: string[]
  timestamp: string
}

export interface OrderDeadLetteredPayload extends BaseNotificationPayload {
  event_type: typeof PRINTIFY_EVENTS.ORDER_DEAD_LETTERED
  order_id: string
  retry_count: number
  error_message: string
}

export interface SyncFailedPayload extends BaseNotificationPayload {
  event_type: typeof PRINTIFY_EVENTS.SYNC_FAILED
  sync_duration_ms: number
  error_message: string
}

export interface WebhookFailedPayload extends BaseNotificationPayload {
  event_type: typeof PRINTIFY_EVENTS.WEBHOOK_FAILED
  webhook_event_type: string
  error_message: string
}

export type NotificationPayload =
  | OrderDeadLetteredPayload
  | SyncFailedPayload
  | WebhookFailedPayload
