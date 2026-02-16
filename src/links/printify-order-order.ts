import { defineLink, Modules } from "@medusajs/framework/utils"
import PrintifyModule from "../modules/printify"

export default defineLink(
  {
    linkable: PrintifyModule.linkable.printifyOrder,
    deleteCascade: true,
  },
  {
    linkable: {
      serviceName: Modules.ORDER,
      field: "order",
      linkable: "order_id",
      primaryKey: "id",
      toJSON() {
        return {
          serviceName: Modules.ORDER,
          field: "order",
          linkable: "order_id",
          primaryKey: "id",
        }
      },
    },
  }
)
