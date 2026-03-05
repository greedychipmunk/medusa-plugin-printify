import { MedusaService } from "@medusajs/framework/utils"
import { PrintifyApiClient } from "./api-client"
import { PrintifyModuleOptions } from "./types"
import PrintifyShop from "./models/shop"
import PrintifyProduct from "./models/product"
import PrintifyOrder from "./models/order"

type InjectedDependencies = Record<string, never>

class PrintifyModuleService extends MedusaService({
  PrintifyShop,
  PrintifyProduct,
  PrintifyOrder,
}) {
  private apiClient: PrintifyApiClient
  private options: PrintifyModuleOptions

  constructor(
    container: InjectedDependencies,
    moduleOptions: { options: PrintifyModuleOptions }
  ) {
    super(...arguments)
    this.options = moduleOptions.options
    this.apiClient = new PrintifyApiClient(moduleOptions.options.apiKey)
  }

  getApiClient(): PrintifyApiClient {
    return this.apiClient
  }

  getOptions(): PrintifyModuleOptions {
    return this.options
  }
}

export { PrintifyModuleService }
export default PrintifyModuleService
