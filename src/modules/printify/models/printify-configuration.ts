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
});

export default PrintifyConfiguration;