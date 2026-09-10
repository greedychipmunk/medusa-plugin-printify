import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { IProductModuleService } from "@medusajs/types"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { createPrintifyOrderWorkflow } from "../workflows/create-printify-order"

type Metadata = Record<string, unknown> | null | undefined

type OrderLineItem = {
  variant_id: string | null
  quantity: number
  metadata?: Metadata
  variant?: { metadata?: Metadata } | null
}

/**
 * Resolve Printify IDs for a line item.
 *
 * Printify IDs live on VARIANT metadata (set by sync-products). Order
 * line items do NOT carry variant metadata (the order module's
 * items.variant relation has no product-module metadata), so the
 * authoritative source is the product module, looked up by
 * variant_id. Item-level metadata is checked first as a fallback for
 * hosts that set it explicitly at add-to-cart time, and the order's
 * embedded variant metadata (when present) as a second fallback.
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
    relations: ["items", "shipping_methods", "shipping_address"],
  })

  const productService = container.resolve<IProductModuleService>(Modules.PRODUCT)
  const items = (order.items ?? []) as unknown as OrderLineItem[]

  // Only process items that map to a Printify variant
  const printifyItems: Array<{
    quantity: number
    productId: string
    variantId: number
  }> = []
  for (const item of items) {
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
