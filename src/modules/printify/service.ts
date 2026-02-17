/**
 * PrintifyModuleService
 *
 * Core module service extending MedusaService factory.
 * Auto-generates CRUD methods for each DML model and hosts
 * all business logic previously spread across separate services.
 */

import { MedusaService, Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PRINTIFY_MODULE } from "./index"
import PrintifyConfiguration from "./models/printify-configuration"
import PrintifyProduct from "./models/printify-product"
import PrintifyOrder from "./models/printify-order"
import { PrintifyOrderStatus } from "./models/printify-order"
import { PrintifyCartItem, PrintifyCartItemOptions } from "./models/printify-cart-item"
import { PrintifyProductVariant } from "./models/printify-product-variant"
import { ProductEnablementHistory } from "./models/product-enablement-history"
import { SyncLog } from "./models/sync-log"
import { PrintifyApiClient, PrintifyProduct as ApiProduct } from "./services/printify-api-client"
import { PrintifyOrderBridge } from "./utils/dml-bridge"
import { logger } from "./utils/logger"
import { PrintifyPluginError, ErrorCode, ErrorSeverity, ErrorFactory } from "./utils/error-handling"

// ── Interfaces ──────────────────────────────────────────────────────

export interface CreateConfigurationParams {
  store_id: string
  printify_api_key: string
  printify_shop_id: string
  webhook_secret?: string
  sync_enabled?: boolean
  sync_frequency?: number
  auto_submit_orders?: boolean
}

export interface UpdateConfigurationParams {
  printify_api_key?: string
  printify_shop_id?: string
  webhook_secret?: string
  sync_enabled?: boolean
  sync_frequency?: number
  auto_submit_orders?: boolean
}

export interface ConfigurationTestResult {
  success: boolean
  shop_info?: { id: number; title: string; sales_channel: string }
  error?: string
}

export interface ProductListOptions {
  page?: number
  limit?: number
  enabled?: boolean
  search?: string
  sort?: "title" | "created_at" | "updated_at" | "last_sync_at"
  order?: "asc" | "desc"
}

export interface ProductListResult {
  products: any[]
  total: number
  page: number
  limit: number
  total_pages: number
}

export interface BulkOperationResult {
  success_count: number
  failure_count: number
  failures: Array<{ product_id: string; error: string }>
  bulk_operation_id: string
}

export interface SyncProductsOptions {
  force?: boolean
  max_age_minutes?: number
}

export interface SyncProductsResult {
  synced_count: number
  failed_count: number
  skipped_count: number
  sync_log_id: string
}

export interface CreateOrderRequest {
  medusaOrderId: string
  customerId?: string
  customerEmail: string
  cartItems: PrintifyCartItem[]
  shippingAddress: any
  shippingCost?: number
  taxAmount?: number
  discountAmount?: number
  shippingMethod?: number
}

export interface OrderListOptions {
  status?: PrintifyOrderStatus[]
  customerId?: string
  dateFrom?: Date
  dateTo?: Date
  limit?: number
  offset?: number
  sortBy?: "createdAt" | "updatedAt" | "status"
  sortOrder?: "asc" | "desc"
}

export interface OrderStatusUpdate {
  printifyOrderId?: string
  status: PrintifyOrderStatus
  note?: string
  trackingNumber?: string
  trackingUrl?: string
  carrier?: string
  shippedAt?: Date
  estimatedDelivery?: Date
}

export interface OrderStats {
  total: number
  pending: number
  processing: number
  shipped: number
  delivered: number
  cancelled: number
  failed: number
  averageProcessingTime: number
  totalValue: number
  currency: string
}

export interface AddToCartRequest {
  productId: string
  variantId: string
  quantity: number
  options?: PrintifyCartItemOptions
  customization?: {
    designId?: string
    designUrl?: string
    personalizationFields?: Record<string, string>
  }
}

export interface CartSummary {
  itemCount: number
  totalQuantity: number
  subtotal: number
  totalDiscount: number
  totalTax: number
  total: number
  currency: string
  formattedSubtotal: string
  formattedTotal: string
  formattedDiscount: string
  formattedTax: string
  items: PrintifyCartItem[]
  hasUnavailableItems: boolean
  requiresCustomization: boolean
}

// ── MedusaService Base ──────────────────────────────────────────────

class PrintifyModuleService extends MedusaService({
  PrintifyConfiguration,
  PrintifyProduct,
  PrintifyOrder,
}) {
  private log = logger.child("PrintifyModuleService")

  // In-memory store for cart (session-scoped/ephemeral)
  private cartItems: Map<string, PrintifyCartItem[]> = new Map()

  // Access the DI container injected by MedusaService at runtime
  private get container(): Record<string, any> {
    return (this as any).__container__
  }

  // ── Configuration Business Logic ────────────────────────────────

  async getConfigurationByStoreId(storeId: string) {
    this.log.info("Getting configuration for store", { storeId })

    const [config] = await this.listPrintifyConfigurations({
      filters: { store_id: storeId },
    })

    return config ?? null
  }

  async createOrUpdateConfiguration(storeId: string, data: CreateConfigurationParams) {
    this.log.info("Creating/updating configuration", { storeId })

    const existing = await this.getConfigurationByStoreId(storeId)

    // Test connection before saving
    const testResult = await this.testApiConnection(
      data.printify_api_key,
      data.printify_shop_id,
    )
    if (!testResult.success) {
      throw ErrorFactory.configError(
        `API connection failed: ${testResult.error}`,
        { storeId },
      )
    }

    if (existing) {
      const [updated] = await this.updatePrintifyConfigurations([
        {
          id: existing.id,
          ...data,
        },
      ])
      return updated
    }

    const created = await this.createPrintifyConfigurations([
      {
        store_id: storeId,
        printify_api_key: data.printify_api_key,
        printify_shop_id: data.printify_shop_id,
        webhook_secret: data.webhook_secret ?? null,
        sync_enabled: data.sync_enabled ?? false,
        sync_frequency: data.sync_frequency ?? 60,
        auto_submit_orders: data.auto_submit_orders ?? false,
      },
    ])
    return created[0]
  }

  async testApiConnection(apiKey: string, shopId: string): Promise<ConfigurationTestResult> {
    try {
      const client = new PrintifyApiClient({ apiKey, shopId })
      const shopInfo = await client.getShop()
      return {
        success: true,
        shop_info: {
          id: shopInfo.id,
          title: shopInfo.title,
          sales_channel: shopInfo.sales_channel,
        },
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  async testConfiguration(storeId: string): Promise<ConfigurationTestResult> {
    const config = await this.getConfigurationByStoreId(storeId)
    if (!config) {
      return { success: false, error: "Configuration not found" }
    }
    return this.testApiConnection(config.printify_api_key, config.printify_shop_id)
  }

  async deleteConfigurationByStoreId(storeId: string): Promise<void> {
    const config = await this.getConfigurationByStoreId(storeId)
    if (!config) {
      throw ErrorFactory.configError("Configuration not found", { storeId })
    }
    await this.deletePrintifyConfigurations([config.id])
  }

  // ── Product Business Logic ──────────────────────────────────────

  async getProductsByConfiguration(
    configId: string,
    options: ProductListOptions = {},
  ): Promise<ProductListResult> {
    const {
      page = 1,
      limit = 50,
      enabled,
      search,
      sort = "created_at",
      order = "desc",
    } = options

    this.log.info("Getting products list", { configId, page, limit })

    const filters: Record<string, any> = { configuration_id: configId }
    if (enabled !== undefined) {
      filters.enabled = enabled
    }

    const [products, count] = await this.listAndCountPrintifyProducts({
      filters,
      skip: (page - 1) * limit,
      take: limit,
      order: { [sort]: order },
    })

    return {
      products,
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
    }
  }

  async getProductById(productId: string) {
    try {
      return await this.retrievePrintifyProduct(productId)
    } catch {
      return null
    }
  }

  async enableProduct(productId: string, triggeredBy: string, reason?: string) {
    this.log.info("Enabling product", { productId, triggeredBy })
    const product = await this.retrievePrintifyProduct(productId)

    const [updated] = await this.updatePrintifyProducts([
      { id: productId, enabled: true },
    ])

    ProductEnablementHistory.forProductEnable({
      product_id: productId,
      configuration_id: product.configuration_id,
      previous_state: product.enabled,
      triggered_by: triggeredBy,
      reason,
    })

    // Create Medusa catalog product and link if not already linked
    try {
      if (!product.medusa_product_id) {
        const medusaProduct = await this.createMedusaProductFromPrintify(product)
        await this.linkProductToMedusa(productId, medusaProduct.id)
        this.log.info("Linked product to Medusa catalog", {
          printifyProductId: productId,
          medusaProductId: medusaProduct.id,
        })
      }
    } catch (error) {
      this.log.warn("Failed to create/link Medusa product (non-fatal)", {
        productId,
        error: (error as Error).message,
      })
    }

    return updated
  }

  async disableProduct(productId: string, triggeredBy: string, reason?: string) {
    this.log.info("Disabling product", { productId, triggeredBy })
    const product = await this.retrievePrintifyProduct(productId)

    const [updated] = await this.updatePrintifyProducts([
      { id: productId, enabled: false },
    ])

    ProductEnablementHistory.forProductDisable({
      product_id: productId,
      configuration_id: product.configuration_id,
      previous_state: product.enabled,
      triggered_by: triggeredBy,
      reason,
    })

    // Unlink from Medusa and remove auto-created product
    try {
      if (product.medusa_product_id) {
        // Remove auto-created Medusa product if applicable
        try {
          const productService = this.container.resolve(Modules.PRODUCT) as any
          const medusaProduct = await productService.retrieveProduct(product.medusa_product_id)
          if (medusaProduct?.metadata?.printify_auto_created) {
            await productService.deleteProducts([product.medusa_product_id])
            this.log.info("Deleted auto-created Medusa product", {
              medusaProductId: product.medusa_product_id,
            })
          }
        } catch (error) {
          this.log.warn("Failed to remove Medusa product (non-fatal)", {
            medusaProductId: product.medusa_product_id,
            error: (error as Error).message,
          })
        }

        await this.unlinkProductFromMedusa(productId)
      }
    } catch (error) {
      this.log.warn("Failed to unlink Medusa product (non-fatal)", {
        productId,
        error: (error as Error).message,
      })
    }

    return updated
  }

  async bulkEnableProducts(
    productIds: string[],
    triggeredBy: string,
    reason?: string,
  ): Promise<BulkOperationResult> {
    const bulkOperationId = ProductEnablementHistory.generateBulkOperationId()
    const result: BulkOperationResult = {
      success_count: 0,
      failure_count: 0,
      failures: [],
      bulk_operation_id: bulkOperationId,
    }

    for (const productId of productIds) {
      try {
        await this.enableProduct(productId, triggeredBy, reason)
        result.success_count++
      } catch (error) {
        result.failure_count++
        result.failures.push({
          product_id: productId,
          error: (error as Error).message,
        })
      }
    }

    return result
  }

  async bulkDisableProducts(
    productIds: string[],
    triggeredBy: string,
    reason?: string,
  ): Promise<BulkOperationResult> {
    const bulkOperationId = ProductEnablementHistory.generateBulkOperationId()
    const result: BulkOperationResult = {
      success_count: 0,
      failure_count: 0,
      failures: [],
      bulk_operation_id: bulkOperationId,
    }

    for (const productId of productIds) {
      try {
        await this.disableProduct(productId, triggeredBy, reason)
        result.success_count++
      } catch (error) {
        result.failure_count++
        result.failures.push({
          product_id: productId,
          error: (error as Error).message,
        })
      }
    }

    return result
  }

  async syncProducts(
    configId: string,
    options: SyncProductsOptions = {},
  ): Promise<SyncProductsResult> {
    const { force = false, max_age_minutes = 60 } = options
    this.log.info("Starting product sync", { configId, force })

    const syncLog = SyncLog.create({
      configuration_id: configId,
      type: force ? "manual_sync" : "full_sync",
      details: { force, max_age_minutes },
    })
    syncLog.markRunning()

    try {
      const config = await this.retrievePrintifyConfiguration(configId)
      const apiClient = new PrintifyApiClient({
        apiKey: config.printify_api_key,
        shopId: config.printify_shop_id,
      })

      const printifyProducts = await this.fetchAllPrintifyProducts(apiClient)

      let syncedCount = 0
      let failedCount = 0
      let skippedCount = 0

      for (const apiProduct of printifyProducts) {
        try {
          // Check if product already exists locally
          const [existing] = await this.listPrintifyProducts({
            filters: {
              printify_product_id: apiProduct.id,
              configuration_id: configId,
            },
          })

          if (existing) {
            if (
              !force &&
              existing.last_sync_at &&
              new Date().getTime() - new Date(existing.last_sync_at).getTime() <
                max_age_minutes * 60 * 1000
            ) {
              skippedCount++
              continue
            }

            await this.updatePrintifyProducts([
              {
                id: existing.id,
                title: apiProduct.title,
                description: apiProduct.description,
                tags: apiProduct.tags as any,
                images: apiProduct.images as any,
                printify_data: apiProduct as any,
                last_sync_at: new Date(),
              },
            ] as any)
          } else {
            await this.createPrintifyProducts([
              {
                printify_product_id: apiProduct.id,
                configuration_id: configId,
                title: apiProduct.title,
                description: apiProduct.description,
                enabled: false,
                blueprint_id: apiProduct.blueprint_id.toString(),
                print_provider_id: "0",
                tags: apiProduct.tags as any,
                images: apiProduct.images as any,
                printify_data: apiProduct as any,
                last_sync_at: new Date(),
              },
            ] as any)
          }
          syncedCount++
        } catch (error) {
          failedCount++
          this.log.warn("Failed to sync product", {
            printifyProductId: apiProduct.id,
            error: (error as Error).message,
          })
        }
      }

      syncLog.updateProgress(syncedCount, failedCount)
      syncLog.addDetails("skipped_count", skippedCount)
      syncLog.markCompleted()

      return {
        synced_count: syncedCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
        sync_log_id: syncLog.id,
      }
    } catch (error) {
      syncLog.markFailed((error as Error).message)
      throw ErrorFactory.productError("Product synchronization failed", { configId })
    }
  }

  private async fetchAllPrintifyProducts(apiClient: PrintifyApiClient): Promise<ApiProduct[]> {
    const allProducts: ApiProduct[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const response = await apiClient.getProducts(page, 100)
      allProducts.push(...response.data)
      hasMore = page < response.last_page
      page++
    }

    return allProducts
  }

  // ── Order Business Logic ────────────────────────────────────────

  async createOrderFromCart(request: CreateOrderRequest): Promise<PrintifyOrderBridge> {
    this.log.info("Creating order from cart", {
      medusaOrderId: request.medusaOrderId,
      itemCount: request.cartItems.length,
    })

    const itemsTotal = (request.cartItems || []).reduce((sum, item) => {
      return sum + (item.pricing?.totalPrice || 0)
    }, 0)

    const subtotal = itemsTotal
    const shippingCost = request.shippingCost || 0
    const taxAmount = request.taxAmount || 0
    const discountAmount = request.discountAmount || 0
    const totalPrice = subtotal + shippingCost + taxAmount - discountAmount

    // Persist order in database
    const results = await this.createPrintifyOrders([
      {
        medusa_order_id: request.medusaOrderId,
        configuration_id: "default",
        status: PrintifyOrderStatus.PENDING,
        line_items: request.cartItems as any,
        shipping_address: request.shippingAddress,
        total_price: totalPrice,
        shipping_method: request.shippingMethod || 1,
      },
    ] as any)
    const created = Array.isArray(results) ? results[0] : results

    // Build bridge for backward compatibility
    const bridgeData = {
      ...created,
      medusaOrderId: request.medusaOrderId,
      printifyOrderId: undefined,
      customerId: request.customerId,
      customerEmail: request.customerEmail,
      shippingMethod: request.shippingMethod,
      pricing: {
        total: totalPrice,
        subtotal,
        shippingCost,
        taxAmount,
        discountAmount,
        currency: "USD",
      },
      items: request.cartItems,
      shippingAddress: request.shippingAddress,
      createdAt: created?.created_at,
      updatedAt: created?.updated_at,
      submittedAt: undefined,
      retryCount: 0,
      maxRetries: 3,
    }

    // Create link to Medusa order
    try {
      const link = this.container.resolve("link") as any
      await link.create({
        [PRINTIFY_MODULE]: { printify_order_id: created.id },
        [Modules.ORDER]: { order_id: request.medusaOrderId },
      })
    } catch (error) {
      this.log.warn("Failed to create order link (non-fatal)", {
        orderId: created.id,
        medusaOrderId: request.medusaOrderId,
        error: (error as Error).message,
      })
    }

    return new PrintifyOrderBridge(bridgeData)
  }

  async submitPrintifyOrder(orderId: string, apiClient: PrintifyApiClient): Promise<PrintifyOrderBridge> {
    const order = await this.getOrderBridge(orderId)

    if (!order.canSubmit()) {
      throw new PrintifyPluginError(
        ErrorCode.VALIDATION_ERROR,
        "Order cannot be submitted in current state",
        ErrorSeverity.MEDIUM,
        { status: order.status },
      )
    }

    const printifyOrderData = this.preparePrintifyOrderData(order)
    const response = await apiClient.createOrder(printifyOrderData)

    if (!response || !response.id) {
      throw new PrintifyPluginError(
        ErrorCode.API_SERVER_ERROR,
        "Invalid response from Printify API",
        ErrorSeverity.HIGH,
      )
    }

    await this.updatePrintifyOrders([
      {
        id: orderId,
        status: PrintifyOrderStatus.SUBMITTED,
        printify_order_id: response.id,
        submitted_at: new Date(),
        error_details: null,
      },
    ])

    order.entity.status = PrintifyOrderStatus.SUBMITTED
    order.entity.printify_order_id = response.id
    order.entity.submitted_at = new Date()
    order.entity.error_details = undefined

    return order
  }

  private buildOrderBridge(entity: any): PrintifyOrderBridge {
    return new PrintifyOrderBridge({
      ...entity,
      medusaOrderId: entity.medusa_order_id || entity.medusaOrderId,
      printifyOrderId: entity.printify_order_id || entity.printifyOrderId,
      pricing: entity.pricing || {
        total: entity.total_price,
        subtotal: entity.total_price,
        shippingCost: 0,
        taxAmount: 0,
        discountAmount: 0,
        currency: "USD",
      },
      items: entity.line_items || entity.items,
      shippingMethod: entity.shipping_method || entity.shippingMethod || 1,
      shippingAddress: entity.shipping_address || entity.shippingAddress,
      createdAt: entity.created_at || entity.createdAt,
      updatedAt: entity.updated_at || entity.updatedAt,
      submittedAt: entity.submitted_at || entity.submittedAt,
      retryCount: entity.retryCount || 0,
      maxRetries: entity.maxRetries || 3,
    })
  }

  async getOrderBridge(orderId: string): Promise<PrintifyOrderBridge> {
    try {
      const entity = await this.retrievePrintifyOrder(orderId)
      return this.buildOrderBridge(entity)
    } catch {
      throw new PrintifyPluginError(
        ErrorCode.ENTITY_NOT_FOUND,
        "Order not found",
        ErrorSeverity.MEDIUM,
        { orderId },
      )
    }
  }

  async getOrderByMedusaId(medusaOrderId: string): Promise<PrintifyOrderBridge | null> {
    const [order] = await this.listPrintifyOrders({
      filters: { medusa_order_id: medusaOrderId },
    })
    return order ? this.buildOrderBridge(order) : null
  }

  async getOrderByPrintifyId(printifyOrderId: string): Promise<PrintifyOrderBridge | null> {
    const [order] = await this.listPrintifyOrders({
      filters: { printify_order_id: printifyOrderId },
    })
    return order ? this.buildOrderBridge(order) : null
  }

  async cancelPrintifyOrder(
    orderId: string,
    apiClient: PrintifyApiClient,
    reason?: string,
  ): Promise<PrintifyOrderBridge> {
    const order = await this.getOrderBridge(orderId)

    if (!order.canCancel()) {
      throw new PrintifyPluginError(
        ErrorCode.VALIDATION_ERROR,
        "Order cannot be cancelled in current state",
        ErrorSeverity.MEDIUM,
        { status: order.status },
      )
    }

    // Cancel on Printify if submitted
    if (order.printifyOrderId && order.status !== PrintifyOrderStatus.PENDING) {
      try {
        await apiClient.cancelOrder(order.printifyOrderId)
      } catch (error) {
        this.log.warn("Failed to cancel order on Printify", {
          printifyOrderId: order.printifyOrderId,
          error: (error as Error).message,
        })
      }
    }

    await this.updatePrintifyOrders([
      {
        id: orderId,
        status: PrintifyOrderStatus.CANCELLED,
      },
    ])

    order.updateStatus(PrintifyOrderStatus.CANCELLED, reason || "Order cancelled")

    return order
  }

  async listOrdersFiltered(options: OrderListOptions = {}): Promise<{
    orders: PrintifyOrderBridge[]
    total: number
    hasMore: boolean
  }> {
    const {
      status,
      limit = 20,
      offset = 0,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options

    const filters: Record<string, any> = {}
    if (status && status.length > 0) {
      filters.status = status
    }

    const dbSortField =
      sortBy === "createdAt"
        ? "created_at"
        : sortBy === "updatedAt"
          ? "updated_at"
          : "status"

    const [orders, count] = await this.listAndCountPrintifyOrders({
      filters,
      skip: offset,
      take: limit,
      order: { [dbSortField]: sortOrder },
    })

    const bridges = orders.map((entity) => this.buildOrderBridge(entity))

    return {
      orders: bridges,
      total: count,
      hasMore: offset + limit < count,
    }
  }

  async getOrderStatsForConfig(): Promise<OrderStats> {
    const [orders] = await this.listAndCountPrintifyOrders({})

    const stats: OrderStats = {
      total: orders.length,
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      failed: 0,
      averageProcessingTime: 0,
      totalValue: 0,
      currency: "USD",
    }

    let totalProcessingTime = 0
    let processedOrdersCount = 0

    for (const order of orders) {
      switch (order.status) {
        case PrintifyOrderStatus.PENDING:
        case "validated":
          stats.pending++
          break
        case PrintifyOrderStatus.SUBMITTED:
        case PrintifyOrderStatus.PROCESSING:
          stats.processing++
          break
        case PrintifyOrderStatus.SHIPPED:
          stats.shipped++
          break
        case PrintifyOrderStatus.DELIVERED:
          stats.delivered++
          break
        case PrintifyOrderStatus.CANCELLED:
          stats.cancelled++
          break
        case PrintifyOrderStatus.FAILED:
          stats.failed++
          break
      }

      const isFinal = [
        PrintifyOrderStatus.DELIVERED,
        PrintifyOrderStatus.CANCELLED,
        PrintifyOrderStatus.FAILED,
      ].includes(order.status as PrintifyOrderStatus)

      if (!isFinal || order.status === PrintifyOrderStatus.DELIVERED) {
        stats.totalValue += order.total_price
      }

      if (
        order.submitted_at &&
        (order.status === PrintifyOrderStatus.SHIPPED ||
          order.status === PrintifyOrderStatus.DELIVERED)
      ) {
        totalProcessingTime +=
          new Date().getTime() - new Date(order.submitted_at).getTime()
        processedOrdersCount++
      }
    }

    if (processedOrdersCount > 0) {
      stats.averageProcessingTime = Math.round(
        totalProcessingTime / processedOrdersCount,
      )
    }

    return stats
  }

  async updateOrderStatus(orderId: string, update: OrderStatusUpdate): Promise<PrintifyOrderBridge> {
    const order = await this.getOrderBridge(orderId)

    order.updateStatus(update.status, update.note, update.printifyOrderId)

    if (update.trackingNumber || update.trackingUrl || update.carrier) {
      order.updateTracking({
        trackingNumber: update.trackingNumber,
        trackingUrl: update.trackingUrl,
        carrier: update.carrier,
        shippedAt: update.shippedAt,
        estimatedDelivery: update.estimatedDelivery,
      })
    }

    await this.updatePrintifyOrders([
      {
        id: orderId,
        status: update.status,
        printify_order_id: update.printifyOrderId || order.printifyOrderId,
        tracking: order.tracking,
      },
    ])

    return order
  }

  async syncOrderStatus(orderId: string, apiClient: PrintifyApiClient): Promise<PrintifyOrderBridge> {
    const order = await this.getOrderBridge(orderId)

    if (!order.printifyOrderId) {
      throw new PrintifyPluginError(
        ErrorCode.VALIDATION_ERROR,
        "Order has not been submitted to Printify",
        ErrorSeverity.MEDIUM,
      )
    }

    const response = await apiClient.getOrder(order.printifyOrderId)
    if (!response) {
      throw new PrintifyPluginError(
        ErrorCode.API_SERVER_ERROR,
        "Invalid response from Printify API",
        ErrorSeverity.HIGH,
      )
    }

    const printifyStatus = this.mapPrintifyStatus(response.status)
    if (printifyStatus !== order.status) {
      order.updateStatus(printifyStatus, `Status synced from Printify: ${response.status}`)
    }

    if (response.tracking) {
      order.updateTracking({
        trackingNumber: response.tracking.tracking_number,
        trackingUrl: response.tracking.tracking_url,
        carrier: response.tracking.carrier,
      })
    }

    await this.updatePrintifyOrders([
      {
        id: orderId,
        status: printifyStatus,
        tracking: order.tracking,
      },
    ])

    return order
  }

  private preparePrintifyOrderData(order: PrintifyOrderBridge): Record<string, any> {
    return {
      external_id: order.medusaOrderId,
      label: `Medusa Order ${order.medusaOrderId}`,
      line_items: order.items.map((item: any) => ({
        product_id: item.printifyProductId,
        variant_id: item.printifyVariantId,
        quantity: item.quantity,
        print_areas: item.customization
          ? [
              {
                variant_ids: [item.printifyVariantId],
                placeholders: item.customization.personalizationFields || {},
              },
            ]
          : undefined,
      })),
      shipping_method: order.shippingMethod || 1,
      send_shipping_notification: true,
      address_to: {
        first_name: order.shippingAddress.firstName || order.shippingAddress.first_name,
        last_name: order.shippingAddress.lastName || order.shippingAddress.last_name,
        email: order.shippingAddress.email,
        phone: order.shippingAddress.phone || "",
        company: order.shippingAddress.company || "",
        address1: order.shippingAddress.address1,
        address2: order.shippingAddress.address2 || "",
        city: order.shippingAddress.city,
        state_code: order.shippingAddress.state || order.shippingAddress.region || "",
        zip: order.shippingAddress.zip,
        country_code: order.shippingAddress.country,
      },
    }
  }

  mapPrintifyStatus(printifyStatus: string): PrintifyOrderStatus {
    switch (printifyStatus.toLowerCase()) {
      case "pending":
        return PrintifyOrderStatus.SUBMITTED
      case "in-production":
      case "production":
        return PrintifyOrderStatus.PROCESSING
      case "shipped":
        return PrintifyOrderStatus.SHIPPED
      case "delivered":
        return PrintifyOrderStatus.DELIVERED
      case "canceled":
      case "cancelled":
        return PrintifyOrderStatus.CANCELLED
      case "failed":
        return PrintifyOrderStatus.FAILED
      default:
        return PrintifyOrderStatus.PROCESSING
    }
  }

  // ── Cart Business Logic (in-memory, session-scoped) ─────────────

  addToCart(cartId: string, item: PrintifyCartItem): PrintifyCartItem {
    const currentItems = this.cartItems.get(cartId) || []
    currentItems.push(item)
    this.cartItems.set(cartId, currentItems)
    return item
  }

  getCartItems(cartId: string): PrintifyCartItem[] {
    return this.cartItems.get(cartId) || []
  }

  async getCartSummary(cartId: string): Promise<CartSummary> {
    const items = this.getCartItems(cartId)

    let subtotal = 0
    let totalDiscount = 0
    let totalTax = 0
    let totalQuantity = 0
    let hasUnavailableItems = false
    let requiresCustomization = false

    for (const item of items) {
      subtotal += item.pricing.totalPrice
      totalQuantity += item.quantity

      if (item.pricing.discountAmount) {
        totalDiscount += item.pricing.discountAmount
      }
      if (item.pricing.taxAmount) {
        totalTax += item.pricing.taxAmount
      }
      if (!item.isAvailable) {
        hasUnavailableItems = true
      }
      if (item.requiresCustomization() && !item.customization?.customizationValid) {
        requiresCustomization = true
      }
    }

    const total = subtotal - totalDiscount + totalTax
    const currency = items[0]?.pricing.currency ?? "USD"

    const formatPrice = (cents: number, cur: string) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(
        cents / 100,
      )

    return {
      itemCount: items.length,
      totalQuantity,
      subtotal,
      totalDiscount,
      totalTax,
      total,
      currency,
      formattedSubtotal: formatPrice(subtotal, currency),
      formattedTotal: formatPrice(total, currency),
      formattedDiscount: formatPrice(totalDiscount, currency),
      formattedTax: formatPrice(totalTax, currency),
      items,
      hasUnavailableItems,
      requiresCustomization,
    }
  }

  clearCart(cartId: string): void {
    this.cartItems.delete(cartId)
  }

  // ── Storefront Product Logic ────────────────────────────────────

  async getStorefrontProducts(options: {
    filters?: Record<string, any>
    limit?: number
    offset?: number
  } = {}) {
    const { filters = {}, limit = 20, offset = 0 } = options

    const dbFilters: Record<string, any> = { enabled: true }
    if (filters.search) {
      dbFilters.title = { $like: `%${filters.search}%` }
    }

    const [products, count] = await this.listAndCountPrintifyProducts({
      filters: dbFilters,
      skip: offset,
      take: limit,
    })

    return {
      products,
      total: count,
      hasMore: offset + limit < count,
    }
  }

  async getStorefrontProduct(productId: string) {
    try {
      const product = await this.retrievePrintifyProduct(productId)
      if (!product.enabled) return null
      return product
    } catch {
      return null
    }
  }

  // ── Helper: build API client from config ────────────────────────

  async getApiClientForConfig(configId: string): Promise<PrintifyApiClient> {
    const config = await this.retrievePrintifyConfiguration(configId)
    return new PrintifyApiClient({
      apiKey: config.printify_api_key,
      shopId: config.printify_shop_id,
    })
  }

  async getApiClientForStore(storeId: string): Promise<PrintifyApiClient> {
    const config = await this.getConfigurationByStoreId(storeId)
    if (!config) {
      throw new PrintifyPluginError(
        ErrorCode.ENTITY_NOT_FOUND,
        "Configuration not found for store",
        ErrorSeverity.MEDIUM,
        { storeId },
      )
    }
    return new PrintifyApiClient({
      apiKey: config.printify_api_key,
      shopId: config.printify_shop_id,
    })
  }

  // ── Module Link Methods ───────────────────────────────────────────

  async linkProductToMedusa(printifyProductId: string, medusaProductId: string): Promise<void> {
    this.log.info("Linking Printify product to Medusa product", { printifyProductId, medusaProductId })

    const link = this.container.resolve("link") as any
    await link.create({
      [PRINTIFY_MODULE]: { printify_product_id: printifyProductId },
      [Modules.PRODUCT]: { product_id: medusaProductId },
    })

    // Update text field for backward compatibility
    await this.updatePrintifyProducts([
      { id: printifyProductId, medusa_product_id: medusaProductId },
    ])
  }

  async unlinkProductFromMedusa(printifyProductId: string): Promise<void> {
    this.log.info("Unlinking Printify product from Medusa", { printifyProductId })

    try {
      const link = this.container.resolve("link") as any
      await link.dismiss({
        [PRINTIFY_MODULE]: { printify_product_id: printifyProductId },
      })
    } catch (error) {
      this.log.warn("Failed to dismiss product link (may not exist)", {
        printifyProductId,
        error: (error as Error).message,
      })
    }

    // Clear text field for backward compatibility
    await this.updatePrintifyProducts([
      { id: printifyProductId, medusa_product_id: null },
    ] as any)
  }

  async createMedusaProductFromPrintify(printifyProduct: any): Promise<any> {
    this.log.info("Creating Medusa product from Printify data", { printifyProductId: printifyProduct.id })

    const productService = this.container.resolve(Modules.PRODUCT) as any

    const images = Array.isArray(printifyProduct.images)
      ? printifyProduct.images.map((img: any, index: number) => ({
          url: typeof img === "string" ? img : img.src || img.url,
          rank: index,
        }))
      : []

    const tags = Array.isArray(printifyProduct.tags)
      ? printifyProduct.tags.map((tag: string) => ({ value: tag }))
      : []

    const [medusaProduct] = await productService.createProducts([
      {
        title: printifyProduct.title,
        description: printifyProduct.description || "",
        status: "published",
        images,
        tags,
        metadata: {
          printify_product_id: printifyProduct.printify_product_id || printifyProduct.id,
          printify_auto_created: true,
        },
      },
    ])

    return medusaProduct
  }

  async getProductWithMedusaData(printifyProductId: string): Promise<any> {
    try {
      const query = this.container.resolve(ContainerRegistrationKeys.QUERY) as any
      const { data } = await query.graph({
        entity: "printify_product",
        fields: [
          "id", "printify_product_id", "title", "description", "enabled",
          "medusa_product_id", "created_at", "updated_at",
          "product.id", "product.handle", "product.thumbnail", "product.status",
        ],
        filters: { id: printifyProductId },
      })
      return data?.[0] ?? null
    } catch (error) {
      this.log.warn("Failed to query product with Medusa data, falling back", {
        printifyProductId,
        error: (error as Error).message,
      })
      return this.getProductById(printifyProductId)
    }
  }

  async getOrderWithMedusaData(printifyOrderId: string): Promise<any> {
    try {
      const query = this.container.resolve(ContainerRegistrationKeys.QUERY) as any
      const { data } = await query.graph({
        entity: "printify_order",
        fields: [
          "id", "medusa_order_id", "printify_order_id", "status",
          "total_price", "created_at", "updated_at",
          "order.id", "order.display_id", "order.status", "order.email",
        ],
        filters: { id: printifyOrderId },
      })
      return data?.[0] ?? null
    } catch (error) {
      this.log.warn("Failed to query order with Medusa data, falling back", {
        printifyOrderId,
        error: (error as Error).message,
      })
      return this.getOrderBridge(printifyOrderId)
    }
  }

}

export default PrintifyModuleService
