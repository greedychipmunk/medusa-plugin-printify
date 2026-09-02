import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { createPrintifyOrderWorkflow } from "../workflows/create-printify-order"

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

  const items: Array<Record<string, unknown>> = (order.items ?? []) as unknown as Array<Record<string, unknown>>

  // Only process items that have Printify metadata
  const printifyItems = items.filter(
    (item) =>
      (item.metadata as Record<string, unknown>)?.printify_product_id
  )

  if (printifyItems.length === 0) {
    return
  }

  // Dry-run mode: skip Printify order creation for test orders.
  // Defaults to true when STRIPE_MODE=test, false otherwise.
  // Set PRINTIFY_DRY_RUN explicitly to override.
  const dryRun =
    process.env.PRINTIFY_DRY_RUN === "true" ||
    (process.env.PRINTIFY_DRY_RUN === undefined &&
      process.env.STRIPE_MODE === "test")

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

  await createPrintifyOrderWorkflow(container).run({
    input: {
      medusaOrderId: order.id as string,
      shopId,
      lineItems: printifyItems.map((item) => ({
        product_id: String((item.metadata as Record<string, unknown>).printify_product_id),
        variant_id: Number((item.metadata as Record<string, unknown>).printify_variant_id),
        quantity: item.quantity as number,
        printify_product_id: String(
          (item.metadata as Record<string, unknown>).printify_product_id
        ),
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
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
