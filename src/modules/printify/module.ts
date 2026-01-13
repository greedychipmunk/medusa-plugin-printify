/**
 * Printify Module Definition
 * 
 * Modern MedusaJS v2 module definition with dependency injection
 * and service registration patterns.
 */

import { Module } from "@medusajs/framework/utils";
import PrintifyConfiguration from "./models/printify-configuration";
import PrintifyProduct from "./models/printify-product";
import PrintifyOrder from "./models/printify-order";
import { PrintifyProductVariant } from "./models/printify-product-variant";
import { PrintifyCartItem } from "./models/printify-cart-item";
import { ProductEnablementHistory } from "./models/product-enablement-history";
import { SyncLog } from "./models/sync-log";

const PrintifyModule = Module("printify", {
  service: class PrintifyModuleService {
    // Placeholder service class for module requirements
    constructor() {}
  },
});

export default PrintifyModule;