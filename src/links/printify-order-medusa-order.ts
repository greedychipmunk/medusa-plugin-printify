import { defineLink } from "@medusajs/framework/utils"
import PrintifyModule from "../modules/printify"
import OrderModule from "@medusajs/medusa/order"

export default defineLink(
  PrintifyModule.linkable.printifyOrder,
  OrderModule.linkable.order
)
