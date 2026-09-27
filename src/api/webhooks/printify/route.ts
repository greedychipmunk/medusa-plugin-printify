import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { IProductModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PRINTIFY_MODULE } from "../../../modules/printify"
import PrintifyModuleService from "../../../modules/printify/service"
import { verifyPrintifySignature } from "../../../lib/webhook-utils"
import { syncProductsWorkflow } from "../../../workflows/sync-products"

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
    await service.updatePrintifyOrders({ selector: { printify_id: printifyOrderId }, data: { status } })
  }
}

async function handleProductEvent(
  body: PrintifyWebhookBody,
  service: PrintifyModuleService,
  container: MedusaContainer
) {
  if (body.type === "product:deleted") {
    const printifyId = String(body.resource.id)
    await service.updatePrintifyProducts({
      selector: { printify_id: printifyId },
      data: { is_published: false },
    })

    // Also draft the linked Medusa product so it's removed from the storefront
    try {
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({
        entity: "printify_product",
        fields: ["product.id"],
        filters: { printify_id: printifyId },
      })
      if (data.length > 0 && data[0].product?.id) {
        const productModuleService = container.resolve<IProductModuleService>(Modules.PRODUCT)
        await productModuleService.updateProducts(data[0].product.id, { status: "draft" as any })
        console.log(`[printify] webhook: drafted Medusa product ${data[0].product.id} after Printify deletion`)
      }
    } catch (err) {
      console.warn(`[printify] webhook: failed to draft Medusa product for printify_id ${printifyId}: ${err}`)
    }

    console.log(`[printify] webhook: product deleted: ${body.resource.id}`)
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
    console.error(`[printify] webhook: failed to sync after product:updated: ${err}`)
  }
}

/**
 * product:publish:started — Printify locked the product and is waiting for
 * this integration to mirror it to its storefront and acknowledge the publish.
 * For custom_integration shops this handshake is the ONLY thing that unlocks
 * the product; without it, products stay in "Publishing" forever.
 *
 * Flow: sync (creates/updates the linked Medusa product) → look up the
 * Medusa product id + handle → report publishing_succeeded with the
 * storefront URL. On any failure, report publishing_failed so the product
 * unlocks and the merchant sees the reason in Printify.
 */
async function handleProductPublishStarted(
  body: PrintifyWebhookBody,
  service: PrintifyModuleService,
  container: MedusaContainer
) {
  const printifyProductId = String(body.resource.id)
  const action = (body.resource.data?.action as string) ?? "create"

  if (action === "delete") {
    // Unpublish handshake — no acknowledgement needed. Storefront cleanup is
    // handled by product:deleted / the sync workflow demoting the product.
    console.log(`[printify] webhook: product unpublish started: ${printifyProductId} — no action needed`)
    return
  }

  console.log(`[printify] webhook: product publish started: ${printifyProductId}, completing handshake`)

  const client = service.getApiClient()
  const options = service.getOptions()
  const shopId = body.shop_id || options.shopId

  if (!shopId) {
    console.error(`[printify] webhook: cannot complete publish handshake without a shop id`)
    return
  }

  try {
    // Sync so the linked Medusa product exists and is published
    await syncProductsWorkflow(container).run({
      input: { shopId },
    })

    // Look up the linked Medusa product for its id and storefront handle
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "printify_product",
      fields: ["product.id", "product.handle"],
      filters: { printify_id: printifyProductId },
    })
    const medusaProduct = data[0]?.product
    if (!medusaProduct?.id || !medusaProduct?.handle) {
      throw new Error(
        `no linked Medusa product for printify_id ${printifyProductId} after sync — ` +
        `check that the product has enabled variants and a sales channel is configured`
      )
    }

    // Storefront URL for the external reference. storefrontBaseUrl is the
    // canonical option; fall back to webhookBaseUrl (same domain in most
    // deployments since the storefront and API share the host).
    const base = (options.storefrontBaseUrl ?? options.webhookBaseUrl ?? "")
      .replace(/\/+$/, "")
    const handle = `${base}/products/${medusaProduct.handle}`

    await client.setPublishSucceeded(shopId, printifyProductId, {
      id: medusaProduct.id,
      handle,
    })
    console.log(`[printify] webhook: publish handshake completed for ${printifyProductId} → ${handle}`)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[printify] webhook: publish handshake failed for ${printifyProductId}: ${reason}`)
    try {
      await client.setPublishFailed(shopId, printifyProductId, reason)
    } catch (failErr) {
      console.error(
        `[printify] webhook: failed to report publish failure to Printify for ${printifyProductId}: ${failErr}`
      )
    }
  }
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
