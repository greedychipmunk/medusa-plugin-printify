/**
 * PrintifyWebhookEvent Entity
 *
 * Stores raw inbound webhook payloads for debugging and replay.
 */

import { model } from "@medusajs/framework/utils"

const PrintifyWebhookEvent = model.define("PrintifyWebhookEvent", {
  id: model.id().primaryKey(),
  configuration_id: model.text(),
  event_type: model.text(),
  payload: model.json(),
  signature: model.text().nullable(),
  processing_status: model.text().default("success"),
  processing_error: model.text().nullable(),
  received_at: model.dateTime(),
  processed_at: model.dateTime().nullable(),
})

export default PrintifyWebhookEvent
