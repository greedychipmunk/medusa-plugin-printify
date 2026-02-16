import { defineLink, Modules } from "@medusajs/framework/utils"
import PrintifyModule from "../modules/printify"

export default defineLink(
  {
    linkable: PrintifyModule.linkable.printifyProduct,
    deleteCascade: true,
  },
  {
    linkable: {
      serviceName: Modules.PRODUCT,
      field: "product",
      linkable: "product_id",
      primaryKey: "id",
      toJSON() {
        return {
          serviceName: Modules.PRODUCT,
          field: "product",
          linkable: "product_id",
          primaryKey: "id",
        }
      },
    },
  }
)
