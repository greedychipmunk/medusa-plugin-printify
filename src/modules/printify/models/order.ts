import { model } from "@medusajs/framework/utils"

const PrintifyOrder = model.define("printify_order", {
  id: model.id().primaryKey(),
  printify_id: model.text().nullable(),
  shop_id: model.text(),
  medusa_order_id: model.text().nullable(),
  status: model.text().default("pending"),
  shipping_method: model.text().nullable(),
  line_items: model.json(),
  address_to: model.json(),
  total_cost: model.number().nullable(),
  cost_per_item: model.json().nullable(),
  submitted_at: model.dateTime().nullable(),
})

export default PrintifyOrder
