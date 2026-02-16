/**
 * Printify Module Definition
 *
 * Modern MedusaJS v2 module definition using the Module utility
 * with PrintifyModuleService as the service class.
 */

import { Module } from "@medusajs/framework/utils"
import PrintifyModuleService from "./service"

const PrintifyModule = Module("printify", {
  service: PrintifyModuleService,
})

export default PrintifyModule
