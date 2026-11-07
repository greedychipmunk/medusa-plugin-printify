import { MedusaService } from "@medusajs/framework/utils"
import type { IModuleService } from "@medusajs/framework/types"
import { PrintifyApiClient } from "./api-client"
import { PrintifyModuleOptions } from "./types"
import { registerWebhooksWithTimeout } from "./register-webhooks"
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
  __hooks: IModuleService["__hooks"]

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

    // Medusa calls module `__hooks.onApplicationStart` during `medusa start`
    // (and during `medusa db:migrate` scripts). This is the startup trigger
    // for webhook registration — Medusa v2 never emits an `app.started` event,
    // so the former subscriber on that event never ran.
    this.__hooks = {
      onApplicationStart: async () => {
        await registerWebhooksWithTimeout(this.apiClient, this.options)
      },
    }
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
