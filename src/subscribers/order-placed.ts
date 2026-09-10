import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { createPrintifyOrderWorkflow } from "../workflows/create-printify-order"

type OrderItemMetadata = Record<string, unknown> | null | undefined

/**
 * Resolve Printify IDs for a line item.
 *
 * Printify IDs live on the *variant* metadata (set by sync-products) —
 * line items do not inherit variant metadata in Medusa v2. Item-level
 * metadata is checked first as a fallback for hosts that set it
 * explicitly at add-to-cart time.
 */
function resolvePrintifyIds(item: {
  metadata?: OrderItemMetadata
  variant?: { metadata?: OrderItemMetadata } | null
}): { productId: string; variantId: number } | null {
  const itemMeta = item.metadata ?? {}
  const variantMeta = item.variant?.metadata ?? {}

  const productId =
    itemMeta.printify_product_id ?? variantMeta.printify_product_id
  const variantId =
    itemMeta.printify_variant_id ?? variantMeta.printify_variant_id

  if (productId == null || variantId == null) return null
  return {
    productId: String(productId),
    variantId: Number(variantId),
  }
}

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const { shopId } = service.getOptions()

  if (!shopId) {
    console.warn("[printify] order-placed: no shopId configured, skipping")
    return
  }

  const orderService = container.resolve("order")
  const order = await orderService.retrieveOrder(data.id, {
    relations: ["items", "items.variant", "shipping_methods", "shipping_address"],
  })

  const items: Array<Record<string, unknown>> = (order.items ?? []) as unknown as Array<Record<string, unknown>>

  // Only process items that map to a Printify variant
  const printifyItems: Array<{
    quantity: number
    productId: string
    variantId: number
  }> = []
  for (const item of items) {
    const ids = resolvePrintifyIds(item as never)
    if (ids) {
      printifyItems.push({
        quantity: item.quantity as number,
        productId: ids.productId,
        variantId: ids.variantId,
      })
    }
  }

  if (printifyItems.length === 0) {
    console.info(
      `[printify] order-placed: order ${data.id} has no Printify items — not forwarding`
    )
    return
  }

  // Dry-run mode: skip Printify order creation for test orders.
  // Set PRINTIFY_DRY_RUN=true in the staging Infisical environment.
  const dryRun = process.env.PRINTIFY_DRY_RUN === "true"

  if (dryRun) {
    console.info(
      `[printify] DRY RUN — skipping order creation for ${order.id} ` +
        `(${printifyItems.length} Printify item(s))`
    )
    return
  }

  const shippingMethod =
    order.shipping_methods?.[0]?.data?.printify_shipping_method ?? 1

  const addr = (order.shipping_address ?? {}) as Record<string, unknown>

  console.info(
    `[printify] order-placed: creating Printify order for ${order.id} ` +
      `(${printifyItems.length} Printify item(s))`
  )

  try {
    await createPrintifyOrderWorkflow(container).run({
      input: {
        medusaOrderId: order.id as string,
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
  } catch (err) {
    console.error(
      `[printify] order-placed: FAILED to create Printify order for ${order.id}:`,
      err
    )
    throw err
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
