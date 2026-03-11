import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRINTIFY_MODULE } from "../../../modules/printify"
import PrintifyModuleService from "../../../modules/printify/service"
import { verifyPrintifySignature } from "../../../lib/webhook-utils"

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
      case "order:status-changed":
      case "order:sent-to-production":
      case "order:shipped":
      case "order:shipment:delivered":
        await handleOrderEvent(body, service)
        break

      case "product:updated":
      case "product:deleted":
        await handleProductEvent(body, service)
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

async function handleOrderEvent(
  body: PrintifyWebhookBody,
  service: PrintifyModuleService
) {
  const printifyOrderId = String(body.resource.id)
  const status =
    (body.resource.data?.status as string) ??
    body.type.split(":").pop() ??
    "unknown"

  const orders = await service.listPrintifyOrders({ printify_id: printifyOrderId })
  if (orders.length > 0) {
    await service.updatePrintifyOrders({ printify_id: printifyOrderId }, { status })
  }
}

async function handleProductEvent(
  body: PrintifyWebhookBody,
  service: PrintifyModuleService
) {
  if (body.type === "product:deleted") {
    await service.updatePrintifyProducts(
      { printify_id: String(body.resource.id) },
      { is_published: false }
    )
  }
  console.log(`[printify] webhook: product event: ${body.type} for ${body.resource.id}`)
}

async function handleShopDisconnected(
  body: PrintifyWebhookBody,
  service: PrintifyModuleService
) {
  console.warn(`[printify] webhook: shop disconnected: ${body.shop_id}`)
  await service.updatePrintifyShops(
    { printify_id: String(body.shop_id) },
    { sales_channel_id: null }
  )
}
