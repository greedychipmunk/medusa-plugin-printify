/**
 * PrintifyConfiguration DML Model
 * 
 * Modern MedusaJS v2 data model definition for Printify configuration.
 */

import { model } from "@medusajs/framework/utils";

export interface PrintifyConfigurationData {
  store_id: string;
  printify_api_key: string;
  printify_shop_id: string;
  webhook_secret?: string;
  sync_enabled?: boolean;
  sync_frequency?: number;
  auto_submit_orders?: boolean;
  max_order_retries?: number;
  retry_backoff_minutes?: number;
}

const PrintifyConfiguration = model.define("PrintifyConfiguration", {
  id: model.id().primaryKey(),
  store_id: model.text(),
  printify_api_key: model.text(), // encrypted
  printify_shop_id: model.text(),
  webhook_secret: model.text().nullable(), // encrypted
  sync_enabled: model.boolean().default(false),
  sync_frequency: model.number().default(60), // minutes
  auto_submit_orders: model.boolean().default(false),
  max_order_retries: model.number().default(3), // DEFAULT_MAX_ORDER_RETRIES
  retry_backoff_minutes: model.number().default(5), // DEFAULT_RETRY_BACKOFF_MINUTES
});

export default PrintifyConfiguration;