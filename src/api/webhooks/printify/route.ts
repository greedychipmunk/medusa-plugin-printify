import crypto from "crypto"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type PrintifyModuleService from "../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../modules/printify"
import { PrintifyOrderStatus } from "../../../modules/printify/models/printify-order"
import { logger } from "../../../modules/printify/utils/logger"
import type { PrintifyWebhookEvent } from "./types"

const webhookLogger = logger.child("PrintifyWebhook")

function verifySignature(
  body: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("hex")
  if (signature.length !== expected.length) return false
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  )
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

  // Retrieve webhook secret from first available configuration
  const [config] = await printifyService.listPrintifyConfigurations({})
  const webhookSecret = config?.webhook_secret

  // Verify HMAC signature if a secret is configured
  if (webhookSecret) {
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body)
    const signature = req.headers["x-printify-signature"] as string | undefined

    if (!verifySignature(rawBody, signature, webhookSecret)) {
      webhookLogger.warn("Webhook signature verification failed")
      res.status(401).json({ error: "Invalid signature" })
      return
    }
  }

  const event = req.body as PrintifyWebhookEvent

  if (!event || !event.type) {
    res.status(400).json({ error: "Invalid event payload" })
    return
  }

  webhookLogger.info("Received webhook event", { type: event.type })

  try {
    switch (event.type) {
      case "order:status-changed":
        await handleOrderStatusChanged(printifyService, event)
        break

      case "order:shipped":
        await handleOrderShipped(printifyService, event)
        break

      case "product:updated":
        await handleProductUpdated(printifyService, event, config)
        break

      case "product:deleted":
        await handleProductDeleted(printifyService, event)
        break

      case "order:sent-to-production":
        await handleOrderSentToProduction(printifyService, event)
        break

      case "order:shipment:delivered":
        await handleOrderDelivered(printifyService, event)
        break

      case "shop:disconnected":
        handleShopDisconnected(event)
        break

      default:
        webhookLogger.info("Unhandled webhook event type", { type: (event as any).type })
    }
  } catch (error) {
    webhookLogger.error("Error processing webhook event", error as Error)
    // Still return 200 to acknowledge receipt and prevent retries
  }

  // Always return 200 to acknowledge receipt
  res.status(200).json({ received: true })
}

async function handleOrderStatusChanged(
  service: PrintifyModuleService,
  event: PrintifyWebhookEvent & { type: "order:status-changed" },
): Promise<void> {
  const printifyOrderId = event.resource.data.id
  const order = await service.getOrderByPrintifyId(printifyOrderId)

  if (!order) {
    webhookLogger.warn("Order not found for webhook", { printifyOrderId })
    return
  }

  const newStatus = service.mapPrintifyStatus(event.resource.data.status)

  if (newStatus !== order.status) {
    await service.updateOrderStatus(order.id, {
      status: newStatus,
      note: `Status updated via webhook: ${event.resource.data.status}`,
    })
    webhookLogger.info("Order status updated", {
      orderId: order.id,
      oldStatus: order.status,
      newStatus,
    })
  }
}

async function handleOrderShipped(
  service: PrintifyModuleService,
  event: PrintifyWebhookEvent & { type: "order:shipped" },
): Promise<void> {
  const printifyOrderId = event.resource.data.id
  const order = await service.getOrderByPrintifyId(printifyOrderId)

  if (!order) {
    webhookLogger.warn("Order not found for shipping webhook", { printifyOrderId })
    return
  }

  const tracking = event.resource.data.tracking
  await service.updateOrderStatus(order.id, {
    status: service.mapPrintifyStatus("shipped"),
    note: "Shipping update received via webhook",
    trackingNumber: tracking?.tracking_number,
    trackingUrl: tracking?.tracking_url,
    carrier: tracking?.carrier,
    shippedAt: new Date(),
  })

  webhookLogger.info("Order shipping updated", {
    orderId: order.id,
    trackingNumber: tracking?.tracking_number,
  })
}

async function handleProductUpdated(
  service: PrintifyModuleService,
  event: PrintifyWebhookEvent & { type: "product:updated" },
  config: any,
): Promise<void> {
  const printifyProductId = event.resource.data.id

  webhookLogger.info("Product update received", { printifyProductId })

  // Find the product locally
  const [existing] = await service.listPrintifyProducts({
    filters: { printify_product_id: printifyProductId },
  })

  if (!existing) {
    webhookLogger.info("Product not tracked locally, skipping", { printifyProductId })
    return
  }

  // Attempt immediate sync if config is available
  if (config?.id) {
    try {
      const apiClient = await service.getApiClientForConfig(config.id)
      const freshData = await apiClient.getProduct(printifyProductId)

      await service.updatePrintifyProducts([
        {
          id: existing.id,
          title: freshData.title,
          description: freshData.description,
          tags: freshData.tags as any,
          images: freshData.images as any,
          printify_data: freshData as any,
          last_sync_at: new Date(),
        },
      ] as any)

      webhookLogger.info("Product immediately synced", {
        productId: existing.id,
        printifyProductId,
      })
      return
    } catch (error) {
      webhookLogger.warn("Immediate sync failed, falling back to mark-for-resync", {
        printifyProductId,
        error: (error as Error).message,
      })
    }
  }

  // Fallback: clear last_sync_at to force re-sync on next cycle
  await service.updatePrintifyProducts([
    {
      id: existing.id,
      last_sync_at: null,
    },
  ] as any)

  webhookLogger.info("Product marked for re-sync", {
    productId: existing.id,
    printifyProductId,
  })
}

async function handleProductDeleted(
  service: PrintifyModuleService,
  event: PrintifyWebhookEvent & { type: "product:deleted" },
): Promise<void> {
  const printifyProductId = event.resource.data.id

  webhookLogger.info("Product deletion received", { printifyProductId })

  const [existing] = await service.listPrintifyProducts({
    filters: { printify_product_id: printifyProductId },
  })

  if (!existing) {
    webhookLogger.info("Deleted product not tracked locally, skipping", { printifyProductId })
    return
  }

  await service.disableProduct(existing.id, "webhook", "Product deleted on Printify")

  webhookLogger.info("Product disabled after Printify deletion", {
    productId: existing.id,
    printifyProductId,
  })
}

async function handleOrderSentToProduction(
  service: PrintifyModuleService,
  event: PrintifyWebhookEvent & { type: "order:sent-to-production" },
): Promise<void> {
  const printifyOrderId = event.resource.data.id
  const order = await service.getOrderByPrintifyId(printifyOrderId)

  if (!order) {
    webhookLogger.warn("Order not found for sent-to-production webhook", { printifyOrderId })
    return
  }

  await service.updateOrderStatus(order.id, {
    status: PrintifyOrderStatus.PROCESSING,
    note: "Order sent to production via webhook",
  })

  webhookLogger.info("Order marked as processing", {
    orderId: order.id,
    printifyOrderId,
  })
}

async function handleOrderDelivered(
  service: PrintifyModuleService,
  event: PrintifyWebhookEvent & { type: "order:shipment:delivered" },
): Promise<void> {
  const printifyOrderId = event.resource.data.id
  const order = await service.getOrderByPrintifyId(printifyOrderId)

  if (!order) {
    webhookLogger.warn("Order not found for delivery webhook", { printifyOrderId })
    return
  }

  await service.updateOrderStatus(order.id, {
    status: PrintifyOrderStatus.DELIVERED,
    note: "Shipment delivered via webhook",
  })

  webhookLogger.info("Order marked as delivered", {
    orderId: order.id,
    printifyOrderId,
  })
}

function handleShopDisconnected(
  event: PrintifyWebhookEvent & { type: "shop:disconnected" },
): void {
  webhookLogger.warn("Shop disconnected event received", {
    shopId: event.resource.data.shop_id,
  })
  // No action needed — config stays intact for potential reconnection
}
