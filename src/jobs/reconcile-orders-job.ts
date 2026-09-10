import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { IProductModuleService } from "@medusajs/types"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { createPrintifyOrderWorkflow } from "../workflows/create-printify-order"

/**
 * Reconciliation job: guarantee every Medusa order with Printify items
 * gets a Printify order, even if the order.placed subscriber failed or
 * was never delivered (transient Printify errors, worker restarts,
 * event bus drops).
 *
 * Runs on an interval; each pass covers a lookback window (default
 * 24h) so an order missed at placement time is picked up within one
 * job interval. Creation is idempotent: the local printify_orders
 * table is the source of truth — if a row with the medusa_order_id
 * already exists, the order is skipped.
 */

type Metadata = Record<string, unknown> | null | undefined

type OrderLineItem = {
  variant_id: string | null
  quantity: number
  metadata?: Metadata
  variant?: { metadata?: Metadata } | null
}

/**
 * Resolve Printify IDs for a line item. Variant metadata lives in the
 * product module (order line items don't carry it) — see the
 * subscriber's resolvePrintifyIds for the full rationale.
 */
async function resolvePrintifyIds(
  productService: IProductModuleService,
  item: OrderLineItem
): Promise<{ productId: string; variantId: number } | null> {
  const itemMeta = item.metadata ?? {}
  const embeddedVariantMeta = item.variant?.metadata ?? {}

  const fromItem =
    itemMeta.printify_product_id ?? embeddedVariantMeta.printify_product_id
  const fromItemVariantId =
    itemMeta.printify_variant_id ?? embeddedVariantMeta.printify_variant_id

  if (fromItem != null && fromItemVariantId != null) {
    return { productId: String(fromItem), variantId: Number(fromItemVariantId) }
  }

  if (!item.variant_id) return null

  const variants = await productService.listProductVariants({
    id: [item.variant_id],
  })
  const variantMeta = ((variants[0]?.metadata ?? {}) ?? {}) as Record<string, unknown>

  const productId = variantMeta.printify_product_id
  const variantId = variantMeta.printify_variant_id
  if (productId == null || variantId == null) return null

  return { productId: String(productId), variantId: Number(variantId) }
}

export default async function reconcileOrdersJob(container: MedusaContainer) {
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const { shopId } = service.getOptions()

  if (!shopId) {
    console.warn("[printify] reconcile-orders-job: no shopId configured, skipping")
    return
  }

  // Dry-run hosts (staging) must not create real Printify orders.
  if (process.env.PRINTIFY_DRY_RUN === "true") {
    return
  }

  const lookbackHours = Number(process.env.PRINTIFY_RECONCILE_LOOKBACK_HOURS ?? 24)
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)

  const orderService = container.resolve("order")
  const productService = container.resolve<IProductModuleService>(Modules.PRODUCT)
  const orders = await orderService.listOrders(
    { created_at: { $gte: since.toISOString() } },
    { relations: ["items", "shipping_methods", "shipping_address"], order: { created_at: "ASC" }, take: 200 }
  )

  let checked = 0
  let created = 0
  let skipped = 0

  for (const order of orders) {
    // Only orders with at least one Printify item are our responsibility.
    const printifyItems: Array<{
      quantity: number
      productId: string
      variantId: number
    }> = []
    for (const item of (order.items ?? []) as unknown as OrderLineItem[]) {
      const ids = await resolvePrintifyIds(productService, item)
      if (ids) {
        printifyItems.push({
          quantity: item.quantity,
          productId: ids.productId,
          variantId: ids.variantId,
        })
      }
    }
    if (printifyItems.length === 0) {
      skipped++
      continue
    }

    checked++

    // Already reconciled? (Local table is the idempotency key.)
    const existing = await service.listPrintifyOrders({
      medusa_order_id: order.id,
    })
    if (existing.length > 0) {
      continue
    }

    const shippingMethod =
      (order.shipping_methods?.[0] as { data?: { printify_shipping_method?: number } } | undefined)
        ?.data?.printify_shipping_method ?? 1

    const addr = (order.shipping_address ?? {}) as Record<string, unknown>

    try {
      await createPrintifyOrderWorkflow(container).run({
        input: {
          medusaOrderId: order.id,
          shopId,
          lineItems: printifyItems.map((item) => ({
            product_id: item.productId,
            variant_id: item.variantId,
            quantity: item.quantity,
            printify_product_id: item.productId,
          })),
          shippingMethod: Number(shippingMethod),
          address: {
            firstName: String(addr.first_name ?? ""),
            lastName: String(addr.last_name ?? ""),
            email: String(addr.email ?? order.email ?? ""),
            phone: String(addr.phone ?? ""),
            address1: String(addr.address_1 ?? ""),
            address2: addr.address_2 != null ? String(addr.address_2) : undefined,
            city: String(addr.city ?? ""),
            province: String(addr.province ?? ""),
            postalCode: String(addr.postal_code ?? ""),
            countryCode: String(addr.country_code ?? ""),
          },
        },
      })
      created++
      console.warn(
        `[printify] reconcile-orders-job: created Printify order for ${order.id} ` +
          `(${printifyItems.length} item(s)) — missed by order.placed`
      )
    } catch (err) {
      console.error(
        `[printify] reconcile-orders-job: failed to create Printify order for ${order.id}:`,
        err
      )
    }
  }

  if (checked > 0 || created > 0) {
    console.info(
      `[printify] reconcile-orders-job: ${checked} Printify order(s) checked, ` +
        `${created} created, ${skipped} non-Printify order(s) skipped`
    )
  }
}

export const config = {
  name: "printify-reconcile-orders",
  // Every 15 minutes
  schedule: "*/15 * * * *",
}
