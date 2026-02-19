/**
 * Notification Emitter Utility
 *
 * Config-aware, fire-and-forget event emission for Printify plugin notifications.
 * Checks the relevant config flag and parses notification_emails before emitting.
 */

import {
  PRINTIFY_EVENTS,
  type PrintifyEventName,
  type NotificationPayload,
} from "../types/notification-events"

/**
 * Maps event names to their corresponding config flag field.
 */
const EVENT_FLAG_MAP: Record<PrintifyEventName, string> = {
  [PRINTIFY_EVENTS.ORDER_DEAD_LETTERED]: "notify_dead_lettered_orders",
  [PRINTIFY_EVENTS.SYNC_FAILED]: "notify_failed_syncs",
  [PRINTIFY_EVENTS.WEBHOOK_FAILED]: "notify_webhook_errors",
}

/**
 * Parse a comma-separated email string into a trimmed, non-empty array.
 */
export function parseNotificationEmails(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0)
}

/**
 * Emit a notification event on the MedusaJS event bus.
 *
 * - Checks the relevant config flag (e.g. `notify_dead_lettered_orders`)
 * - Parses `notification_emails` into an array; skips if empty
 * - Resolves `IEventBusService` from the container and emits
 * - Fire-and-forget: catches and logs errors, never throws
 */
export async function emitNotification(
  container: { resolve: (key: string) => any },
  config: Record<string, any> | null | undefined,
  eventName: PrintifyEventName,
  payload: Record<string, any>,
): Promise<void> {
  try {
    if (!config) return

    // Check whether the notification flag is enabled
    const flagField = EVENT_FLAG_MAP[eventName]
    if (flagField && config[flagField] === false) return

    // Parse emails
    const emails = parseNotificationEmails(config.notification_emails)
    if (emails.length === 0) return

    // Build full payload
    const fullPayload: NotificationPayload = {
      ...payload,
      event_type: eventName,
      configuration_id: config.id,
      notification_emails: emails,
      timestamp: new Date().toISOString(),
    } as NotificationPayload

    // Resolve event bus and emit
    const eventBus = container.resolve("event_bus")
    if (!eventBus || typeof eventBus.emit !== "function") return

    await eventBus.emit(eventName, fullPayload)
  } catch (error) {
    // Fire-and-forget — log and swallow
    try {
      const logger = container.resolve("logger")
      if (logger && typeof logger.warn === "function") {
        logger.warn("Failed to emit notification event (non-fatal)", {
          eventName,
          error: (error as Error).message,
        })
      }
    } catch {
      // Swallow logger resolution errors too
    }
  }
}
