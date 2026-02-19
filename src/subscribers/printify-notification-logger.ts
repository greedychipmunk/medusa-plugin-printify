/**
 * Printify Notification Logger Subscriber
 *
 * Reference subscriber that listens to all Printify notification events
 * and logs them at warn level. Serves as documentation and a starting
 * point for admins building their own email notification subscriber.
 *
 * To build a custom email subscriber, copy this file and replace the
 * logger.warn calls with your preferred email/notification service.
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { PRINTIFY_EVENTS } from "../modules/printify/types/notification-events"
import type {
  OrderDeadLetteredPayload,
  SyncFailedPayload,
  WebhookFailedPayload,
} from "../modules/printify/types/notification-events"

export default async function printifyNotificationLogger({
  event,
  container,
}: SubscriberArgs<OrderDeadLetteredPayload | SyncFailedPayload | WebhookFailedPayload>) {
  const logger = container.resolve("logger") as any
  const data = event.data

  switch (data.event_type) {
    case PRINTIFY_EVENTS.ORDER_DEAD_LETTERED: {
      const payload = data as OrderDeadLetteredPayload
      logger.warn("[Printify Notification] Order dead-lettered", {
        order_id: payload.order_id,
        retry_count: payload.retry_count,
        error_message: payload.error_message,
        notification_emails: payload.notification_emails,
        configuration_id: payload.configuration_id,
      })
      break
    }

    case PRINTIFY_EVENTS.SYNC_FAILED: {
      const payload = data as SyncFailedPayload
      logger.warn("[Printify Notification] Product sync failed", {
        sync_duration_ms: payload.sync_duration_ms,
        error_message: payload.error_message,
        notification_emails: payload.notification_emails,
        configuration_id: payload.configuration_id,
      })
      break
    }

    case PRINTIFY_EVENTS.WEBHOOK_FAILED: {
      const payload = data as WebhookFailedPayload
      logger.warn("[Printify Notification] Webhook processing failed", {
        webhook_event_type: payload.webhook_event_type,
        error_message: payload.error_message,
        notification_emails: payload.notification_emails,
        configuration_id: payload.configuration_id,
      })
      break
    }

    default:
      logger.warn("[Printify Notification] Unknown notification event", { data })
  }
}

export const config: SubscriberConfig = {
  event: [
    PRINTIFY_EVENTS.ORDER_DEAD_LETTERED,
    PRINTIFY_EVENTS.SYNC_FAILED,
    PRINTIFY_EVENTS.WEBHOOK_FAILED,
  ],
}
