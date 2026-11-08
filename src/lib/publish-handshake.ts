import { IProductModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { syncProductsWorkflow } from "../workflows/sync-products"
import { isPrintifyPublished, isPrintifyPublishing, isPublicationComplete } from "../workflows/visibility"

/**
 * Custom-integration publish handshake, shared by the webhook, the scheduled
 * reconcile job and the reconcile script.
 *
 * Prepare a PRIVATE draft, acknowledge the external id/handle, then refresh
 * confirmed upstream facts. The final sync applies the storefront visibility
 * policy, so a product hidden in Printify completes publishing but stays draft.
 * A refresh failure after acknowledgment is a local repair/retry, NOT a failed
 * publication. See docs/2026-11-08_publish-handshake-hidden-products.md.
 */

export type HandshakeOutcome = "acknowledged" | "already_complete"

/** Thrown by the handshake; `acknowledged` distinguishes a post-ack refresh
 * failure (local repair) from a publication that was never acknowledged. */
export class PublishHandshakeError extends Error {
  constructor(message: string, readonly stage: string, readonly acknowledged: boolean) {
    super(message)
    this.name = "PublishHandshakeError"
  }
}
export type HandshakeLog = (level: "info" | "error", line: string) => void

const consoleLog: HandshakeLog = (level, line) =>
  level === "error" ? console.error(line) : console.log(line)

export async function draftLinkedProduct(container: MedusaContainer, printifyId: string) {
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

async function persistUpstream(service: PrintifyModuleService, printifyId: string, upstream: unknown) {
  await service.updatePrintifyProducts({
    selector: { printify_id: printifyId },
    data: {
      is_published: isPrintifyPublished(upstream),
      is_locked: (upstream as { is_locked?: unknown } | null)?.is_locked !== false,
      printify_data: upstream && typeof upstream === "object" && !Array.isArray(upstream)
        ? upstream as Record<string, unknown> : null,
    },
  })
}

export async function completePublishHandshake(
  container: MedusaContainer,
  shopId: string | undefined,
  printifyProductId: string,
  log: HandshakeLog = consoleLog,
  tag = "[printify] webhook"
): Promise<HandshakeOutcome> {
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const options = service.getOptions()
  let client: ReturnType<PrintifyModuleService["getApiClient"]> | undefined
  let stage = "prepare"
  let pending = false
  let acknowledged = false
  const context = () => ({ stage, shop_id: shopId, printify_id: printifyProductId, acknowledged })

  try {
    if (!shopId) throw new Error("cannot complete publish handshake without a shop id")
    client = service.getApiClient()
    log("info", `${tag}: ${JSON.stringify(context())}`)
    await syncProductsWorkflow(container).run({ input: { shopId } })

    stage = "verify_pending"
    const upstream = await client.getProduct(shopId, printifyProductId)
    await persistUpstream(service, printifyProductId, upstream)
    pending = isPrintifyPublishing(upstream)
    if (isPublicationComplete(upstream)) {
      // Only positive external publication evidence makes this a completed repeat.
      log("info", `${tag}: ${JSON.stringify({ ...context(), completed_repeat: true })}`)
      return "already_complete"
    }
    if (!pending) {
      // publishing_failed also unlocks; an unlocked product without external
      // evidence is not waiting on us. Do not acknowledge unrelated requests.
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
    await persistUpstream(service, printifyProductId, confirmed)
    if (!isPublicationComplete(confirmed)) {
      throw new Error("Printify publication completion is not yet confirmed")
    }
    // The workflow re-fetches the catalog and applies the shared visibility policy,
    // including Printify's hidden flag and merchant hide intent. The
    // acknowledgment alone never promotes.
    await syncProductsWorkflow(container).run({ input: { shopId } })
    log("info", `${tag}: ${JSON.stringify({
      ...context(), handle, storefront_eligible: isPrintifyPublished(confirmed),
    })}`)
    return "acknowledged"
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    log("error", `${tag}: ${JSON.stringify({ ...context(), error: reason })}`)
    try {
      await draftLinkedProduct(container, printifyProductId)
    } catch (draftErr) {
      log("error", `${tag}: ${JSON.stringify({ ...context(), stage: "demote", error: String(draftErr) })}`)
    }
    // Never tell Printify a successful publication failed because a subsequent
    // read/sync failed. Nor cancel an unrelated/completed request on stale delivery.
    if (pending && !acknowledged && shopId && client) {
      try {
        await client.setPublishFailed(shopId, printifyProductId, reason)
      } catch (failErr) {
        log("error", `${tag}: ${JSON.stringify({ ...context(), stage: "report_failure", error: String(failErr) })}`)
      }
    }
    throw new PublishHandshakeError(reason, stage, acknowledged)
  }
}

/**
 * Single-flight per Printify product: duplicate webhook deliveries and the
 * reconcile job join the in-flight handshake instead of racing it. TrendTri
 * runs one Medusa process (shared worker mode), so in-process is sufficient.
 */
const inFlight = new Map<string, Promise<HandshakeOutcome>>()

export function runPublishHandshake(
  container: MedusaContainer,
  shopId: string | undefined,
  printifyProductId: string,
  log?: HandshakeLog,
  tag?: string
): Promise<HandshakeOutcome> {
  const key = `${shopId ?? ""}:${printifyProductId}`
  const existing = inFlight.get(key)
  if (existing) return existing
  const promise = completePublishHandshake(container, shopId, printifyProductId, log, tag)
    .finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

/** Test/shutdown helper: settle every in-flight handshake. */
export async function waitForPublishHandshakes(): Promise<void> {
  while (inFlight.size > 0) {
    await Promise.allSettled([...inFlight.values()])
  }
}
