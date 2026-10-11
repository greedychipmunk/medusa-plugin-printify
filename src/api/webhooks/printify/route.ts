import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { IProductModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PRINTIFY_MODULE } from "../../../modules/printify"
import PrintifyModuleService from "../../../modules/printify/service"
import { verifyPrintifySignature } from "../../../lib/webhook-utils"
import { syncProductsWorkflow } from "../../../workflows/sync-products"
import { isPrintifyPublished, isPrintifyPublishing } from "../../../workflows/visibility"

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
    console.error(`[printify] webhook: failed to sync after product:updated: ${err}`)
  }
}

async function draftLinkedProduct(container: MedusaContainer, printifyId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "printify_product",
    fields: ["product.id"],
    filters: { printify_id: printifyId },
  })
  const products = container.resolve<IProductModuleService>(Modules.PRODUCT)
  for (const row of data) {
    if (row.product?.id) await products.updateProducts(row.product.id, { status: "draft" })
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
    console.error(`[printify] webhook: ${JSON.stringify({ stage: "unpublish", printify_id: printifyId, error: String(err) })}`)
    throw err
  }
}

/**
 * Prepare a PRIVATE draft, acknowledge the external id/handle, then refresh
 * confirmed upstream facts before promotion. See docs/2026-10-10_printify-publication-gate.md.
 * A refresh failure after acknowledgment is a local repair/retry, NOT a failed publication.
 */
async function handleProductPublishStarted(
  body: PrintifyWebhookBody,
  service: PrintifyModuleService,
  container: MedusaContainer
) {
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

  let client: ReturnType<PrintifyModuleService["getApiClient"]> | undefined
  const options = service.getOptions()
  const shopId = body.shop_id || options.shopId
  let stage = "prepare"
  let pending = false
  let acknowledged = false
  const context = () => ({ stage, shop_id: shopId, printify_id: printifyProductId, acknowledged })

  try {
    if (!shopId) throw new Error("cannot complete publish handshake without a shop id")
    client = service.getApiClient()
    console.log(`[printify] webhook: ${JSON.stringify(context())}`)
    await syncProductsWorkflow(container).run({ input: { shopId } })

    stage = "verify_pending"
    const upstream = await client.getProduct(shopId, printifyProductId)
    await service.updatePrintifyProducts({
      selector: { printify_id: printifyProductId },
      data: {
        is_published: isPrintifyPublished(upstream),
        is_locked: upstream?.is_locked !== false,
        printify_data: upstream && typeof upstream === "object" && !Array.isArray(upstream)
          ? upstream as unknown as Record<string, unknown> : null,
      },
    })
    pending = isPrintifyPublishing(upstream)
    if (isPrintifyPublished(upstream)) {
      // Only positive external publication evidence makes this a completed repeat.
      console.log(`[printify] webhook: ${JSON.stringify({ ...context(), completed_repeat: true })}`)
      return
    }
    if (!pending) {
      // visible defaults to true; publishing_failed also unlocks. Neither proves
      // completion without external.id/handle. Do not acknowledge unrelated requests.
      throw new Error("Printify request is neither pending nor positively completed")
    }

    stage = "link"
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "printify_product",
      fields: ["product.id", "product.handle"],
      filters: { printify_id: printifyProductId },
    })
    const medusaProduct = data[0]?.product
    if (!medusaProduct?.id || !medusaProduct?.handle) {
      throw new Error("no linked Medusa product with a handle after private preparation")
    }
    // Defensive demotion covers stale linked products even if preparation skipped a mapping.
    await draftLinkedProduct(container, printifyProductId)
    const base = (options.storefrontBaseUrl ?? options.webhookBaseUrl ?? "").replace(/\/+$/, "")
    const handle = `${base}/products/${medusaProduct.handle}`

    stage = "acknowledge"
    await client.setPublishSucceeded(shopId, printifyProductId, { id: medusaProduct.id, handle })
    acknowledged = true

    stage = "confirmed_refresh"
    const confirmed = await client.getProduct(shopId, printifyProductId)
    await service.updatePrintifyProducts({
      selector: { printify_id: printifyProductId },
      data: {
        is_published: isPrintifyPublished(confirmed),
        is_locked: confirmed?.is_locked !== false,
        printify_data: confirmed && typeof confirmed === "object" && !Array.isArray(confirmed)
          ? confirmed as unknown as Record<string, unknown> : null,
      },
    })
    if (!isPrintifyPublished(confirmed)) {
      throw new Error("Printify publication completion is not yet confirmed")
    }
    // The workflow re-fetches the catalog and applies the shared visibility policy,
    // including merchant hide intent. The acknowledgment alone never promotes.
    await syncProductsWorkflow(container).run({ input: { shopId } })
    console.log(`[printify] webhook: ${JSON.stringify({ ...context(), handle })}`)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[printify] webhook: ${JSON.stringify({ ...context(), error: reason })}`)
    try {
      await draftLinkedProduct(container, printifyProductId)
    } catch (draftErr) {
      console.error(`[printify] webhook: ${JSON.stringify({ ...context(), stage: "demote", error: String(draftErr) })}`)
    }
    // Never tell Printify a successful publication failed because a subsequent
    // read/sync failed. Nor cancel an unrelated/completed request on stale delivery.
    if (pending && !acknowledged && shopId && client) {
      try {
        await client.setPublishFailed(shopId, printifyProductId, reason)
      } catch (failErr) {
        console.error(`[printify] webhook: ${JSON.stringify({ ...context(), stage: "report_failure", error: String(failErr) })}`)
      }
    }
    throw err
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
