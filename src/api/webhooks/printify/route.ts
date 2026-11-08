import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaContainer } from "@medusajs/framework/types"
import { PRINTIFY_MODULE } from "../../../modules/printify"
import PrintifyModuleService from "../../../modules/printify/service"
import { verifyPrintifySignature } from "../../../lib/webhook-utils"
import { syncProductsWorkflow } from "../../../workflows/sync-products"
import { draftLinkedProduct, runPublishHandshake } from "../../../lib/publish-handshake"
import { errorMessage, errorStack } from "../../../lib/format-error"

type PrintifyWebhookBody = {
  type: string
  shop_id: string
  resource: {
    id: string
    type: string
    data?: Record<string, unknown>
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const { webhookSecret } = service.getOptions()

  const signature = req.headers["x-pfy-signature"] as string
  // Prefer the raw body captured by the bodyParser middleware (preserveRawBody: true)
  // to ensure HMAC verification uses the exact bytes Printify signed.
  // Fall back to re-serialized JSON only if rawBody was not captured.
  const rawBody = (req.rawBody as string | undefined) ?? JSON.stringify(req.body)

  if (!verifyPrintifySignature(rawBody, signature ?? "", webhookSecret)) {
    return res.status(401).json({ error: "Invalid signature" })
  }

  const body = req.body as PrintifyWebhookBody

  try {
    switch (body.type) {
      case "order:updated":
      case "order:sent-to-production":
      case "order:shipment:created":
      case "order:shipment:delivered":
        await handleOrderEvent(body, service)
        break

      case "product:updated":
      case "product:deleted":
        await handleProductEvent(body, service, req.scope)
        break

      case "product:publish:started":
        await handleProductPublishStarted(body, service, req.scope)
        break

      case "shop:disconnected":
        await handleShopDisconnected(body, service)
        break

      default:
        console.warn(`[printify] webhook: unhandled event type: ${body.type}`)
    }

    res.sendStatus(200)
  } catch (err) {
    console.error("[printify] webhook handler error:", err)
    res.status(500).json({ error: "Internal error" })
  }
}

/**
 * Local status written for each Printify order event. `order:updated` carries
 * Printify's own order status (e.g. "in-production", "fulfilled") in
 * `resource.data.status`; the other events carry no status, so they map to a
 * fixed value. Event names and payloads: developers.printify.com "Events".
 */
const ORDER_EVENT_STATUS: Record<string, string | undefined> = {
  "order:updated": undefined, // from payload
  "order:sent-to-production": "sent-to-production",
  "order:shipment:created": "shipped",
  "order:shipment:delivered": "delivered",
}

async function handleOrderEvent(
  body: PrintifyWebhookBody,
  service: PrintifyModuleService
) {
  const printifyOrderId = String(body.resource.id)
  const payloadStatus = body.resource.data?.status
  const status =
    body.type === "order:updated"
      ? typeof payloadStatus === "string" && payloadStatus
        ? payloadStatus
        : undefined
      : ORDER_EVENT_STATUS[body.type]

  if (!status) {
    console.warn(`[printify] webhook: ${body.type} for order ${printifyOrderId} has no status; ignoring`)
    return
  }

  const orders = await service.listPrintifyOrders({ printify_id: printifyOrderId })
  if (orders.length > 0) {
    await service.updatePrintifyOrders({ selector: { printify_id: printifyOrderId }, data: { status } })
  }
}

async function handleProductEvent(
  body: PrintifyWebhookBody,
  service: PrintifyModuleService,
  container: MedusaContainer
) {
  if (body.type === "product:deleted") {
    await unpublishProduct(String(body.resource.id), service, container)
    return
  }

  // product:updated — re-sync this single product via the full workflow
  // This fetches latest data from Printify, upserts the printify_product,
  // and creates/updates the linked Medusa product
  console.log(`[printify] webhook: product updated: ${body.resource.id}, triggering sync`)
  try {
    await syncProductsWorkflow(container).run({
      input: { shopId: body.shop_id },
    })
  } catch (err) {
    console.error(`[printify] webhook: failed to sync after product:updated: ${errorMessage(err)}`)
    const stack = errorStack(err)
    if (stack) console.error(stack)
  }
}

async function unpublishProduct(
  printifyId: string,
  service: PrintifyModuleService,
  container: MedusaContainer
) {
  // Draft first: even a failure to persist module facts must not leave merchandise public.
  // Let errors reach POST so Printify retries instead of accepting a failed demotion.
  try {
    await draftLinkedProduct(container, printifyId)
    await service.updatePrintifyProducts({
      selector: { printify_id: printifyId },
      data: { is_published: false, is_locked: true },
    })
    console.log(`[printify] webhook: ${JSON.stringify({ stage: "unpublish", printify_id: printifyId })}`)
  } catch (err) {
    console.error(`[printify] webhook: ${JSON.stringify({ stage: "unpublish", printify_id: printifyId, error: errorMessage(err) })}`)
    throw err
  }
}

/**
 * Answer Printify immediately, then run the handshake in the background.
 * The handshake includes a full catalog sync (~45 s), longer than Printify
 * waits for a webhook response; answering late made Printify abandon and
 * redeliver, stacking concurrent syncs. Failures are logged with stage
 * context; the scheduled reconcile job retries any request still locked.
 * See docs/2026-11-08_publish-handshake-hidden-products.md.
 */
async function handleProductPublishStarted(
  body: PrintifyWebhookBody,
  service: PrintifyModuleService,
  container: MedusaContainer
): Promise<void> {
  const printifyProductId = String(body.resource.id)
  const action = (body.resource.data?.action as string) ?? "create"
  if (action === "delete") {
    await unpublishProduct(printifyProductId, service, container)
    return
  }
  if (action !== "create" && action !== "update") {
    console.warn(`[printify] webhook: unsupported publish action ${action}`)
    // A signed publication-start event invalidates the old public state even
    // when its action is unknown. Do not acknowledge an unrecognized request.
    await unpublishProduct(printifyProductId, service, container)
    throw new Error(`Unsupported Printify publish action: ${action}`)
  }
  const shopId = body.shop_id ? String(body.shop_id) : service.getOptions().shopId
  // Errors are already logged with stage context inside the handshake.
  runPublishHandshake(container, shopId, printifyProductId).catch(() => {})
}

async function handleShopDisconnected(
  body: PrintifyWebhookBody,
  service: PrintifyModuleService
) {
  console.warn(`[printify] webhook: shop disconnected: ${body.shop_id}`)
  await service.updatePrintifyShops({
    selector: { printify_id: String(body.shop_id) },
    data: { sales_channel_id: null },
  })
}
