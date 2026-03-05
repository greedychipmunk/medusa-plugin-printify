import { model } from "@medusajs/framework/utils"

const PrintifyProduct = model.define("printify_product", {
  id: model.id().primaryKey(),
  printify_id: model.text(),
  shop_id: model.text(),
  title: model.text(),
  description: model.text(),
  variants: model.json(),
  images: model.json(),
  print_areas: model.json(),
  is_published: model.boolean().default(false),
  printify_data: model.json().nullable(),
})

export default PrintifyProduct
