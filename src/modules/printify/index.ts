import { Module } from "@medusajs/framework/utils"
import PrintifyModuleService from "./service"

export const PRINTIFY_MODULE = "printify"

export default Module(PRINTIFY_MODULE, {
  service: PrintifyModuleService,
})
