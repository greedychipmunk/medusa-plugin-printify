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
    moduleOptions: { options: PrintifyModuleOptions } | PrintifyModuleOptions
  ) {
    super(container, moduleOptions)
    const options =
      "options" in moduleOptions && moduleOptions.options != null
        ? moduleOptions.options
        : (moduleOptions as PrintifyModuleOptions)
    if (!options?.apiKey) {
      throw new Error(
        "[medusa-plugin-printify] Missing required option: apiKey. " +
          "Ensure the plugin is configured with { apiKey, webhookSecret } in your medusa-config."
      )
    }
    this.options = options
    this.apiClient = new PrintifyApiClient(options.apiKey)
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
