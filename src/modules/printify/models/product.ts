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
  // Printify lock state. Informational: for custom_integration shops a
  // product stays locked until this plugin completes the publish handshake,
  // so locked+visible is still treated as published (see workflows/visibility.ts).
  // Persisted so lock state is queryable without parsing printify_data.
  is_locked: model.boolean().default(false),
  // Three-state intent:
  //   null  = follow Printify's is_locked flag (default, set on sync)
  //   true  = admin force-published (sync will not overwrite is_published)
  //   false = admin force-hidden    (sync will not overwrite is_published)
  visibility_override: model.boolean().nullable(),
  printify_data: model.json().nullable(),
})

export default PrintifyProduct
