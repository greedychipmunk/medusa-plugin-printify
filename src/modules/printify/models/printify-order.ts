/**
 * PrintifyOrder Entity
 * 
 * Represents a Printify order and its fulfillment status.
 * Tracks order lifecycle from creation through fulfillment.
 */

import { model } from "@medusajs/framework/utils";

export enum PrintifyOrderStatus {
  PENDING = 'pending',
  VALIDATED = 'validated',
  SUBMITTED = 'submitted',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  FAILED = 'failed'
}

const PrintifyOrder = model.define("PrintifyOrder", {
  id: model.id().primaryKey(),
  medusa_order_id: model.text(),
  printify_order_id: model.text().nullable(),
  configuration_id: model.text(),
  status: model.text().default("pending"),
  line_items: model.json(),
  shipping_address: model.json(),
  total_price: model.number(),
  tracking: model.json().nullable(),
  printify_data: model.json().nullable(),
  submitted_at: model.dateTime().nullable(),
  error_details: model.text().nullable(),
  retry_count: model.number().default(0),
  last_error_at: model.dateTime().nullable(),
});

export default PrintifyOrder;