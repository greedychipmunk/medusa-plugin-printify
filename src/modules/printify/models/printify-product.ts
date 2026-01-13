/**
 * PrintifyProduct DML Model
 * 
 * Modern MedusaJS v2 data model definition for Printify products.
 */

import { model } from "@medusajs/framework/utils";

const PrintifyProduct = model.define("PrintifyProduct", {
  id: model.id().primaryKey(),
  printify_product_id: model.text(),
  medusa_product_id: model.text().nullable(),
  configuration_id: model.text(),
  title: model.text(),
  description: model.text().nullable(),
  enabled: model.boolean().default(false),
  blueprint_id: model.text(),
  print_provider_id: model.text(),
  tags: model.json().nullable(),
  images: model.json().nullable(),
  printify_data: model.json().nullable(),
  last_sync_at: model.dateTime().nullable(),
});

export default PrintifyProduct;