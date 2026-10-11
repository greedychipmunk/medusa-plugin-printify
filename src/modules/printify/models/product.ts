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
  // Confirmed upstream publication, not the default-true `visible` flag.
  // Requires visible, unlocked, and a successful external publication record.
  is_published: model.boolean().default(false),
  // Authoritative upstream publishing state. Locked products remain private
  // until the publish handshake completes and an unlocked state is confirmed.
  is_locked: model.boolean().default(false),
  // Three-state intent:
  //   null  = follow confirmed Printify publication (default)
  //   true  = allow visibility only after confirmed Printify publication
  //   false = additionally hide the product, even if Printify publishes it
  // Upstream is_published/is_locked facts are refreshed regardless of intent.
  visibility_override: model.boolean().nullable(),
  printify_data: model.json().nullable(),
})

export default PrintifyProduct
