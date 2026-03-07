import { model } from "@medusajs/framework/utils"

const PrintifyShop = model.define("printify_shop", {
  id: model.id().primaryKey(),
  printify_id: model.text(),
  title: model.text(),
  sales_channel_id: model.text().nullable(),
})

export default PrintifyShop
