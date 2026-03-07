import { defineLink } from "@medusajs/framework/utils"
import PrintifyModule from "../modules/printify"
import ProductModule from "@medusajs/medusa/product"

export default defineLink(
  PrintifyModule.linkable.printifyProduct,
  ProductModule.linkable.product
)
