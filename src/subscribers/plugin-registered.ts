import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"

const WEBHOOK_TOPICS = [
  "order:status-changed",
  "order:shipped",
  "order:sent-to-production",
  "order:shipment:delivered",
  "product:updated",
  "product:deleted",
  "product:publish:started",
  "shop:disconnected",
]

export default async function registerWebhooksHandler({
  container,
}: SubscriberArgs<unknown>) {
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const options = service.getOptions()
  const { shopId, webhookBaseUrl, webhookSecret } = options

  if (!shopId || !webhookBaseUrl) {
    console.warn("[printify] webhook registration skipped: missing shopId or webhookBaseUrl")
    return
  }

  const client = service.getApiClient()
  const webhookUrl = `${webhookBaseUrl}/webhooks/printify`

  let existing
  try {
    existing = await client.getWebhooks(shopId)
  } catch (err) {
    console.warn(`[printify] failed to list existing webhooks: ${err}`)
    return
  }

  for (const topic of WEBHOOK_TOPICS) {
    const match = existing.find(w => w.topic === topic)
    try {
      if (!match) {
        await client.createWebhook(shopId, topic, webhookUrl, webhookSecret)
        console.log(`[printify] registered webhook: ${topic}`)
      } else if (webhookSecret && !match.secret) {
        // Webhooks registered before secret support are unsigned, so every
        // delivery fails signature verification. Printify's update endpoint
        // does not document a secret field, so replace the webhook. If the
        // recreate fails, the next app.started retries the replacement.
        await client.deleteWebhook(shopId, match.id)
        await client.createWebhook(shopId, topic, webhookUrl, webhookSecret)
        console.log(`[printify] re-registered webhook with secret: ${topic}`)
      }
    } catch (err) {
      // One rejected topic must not abort the whole loop — a single
      // Printify validation failure (e.g. topic not supported for the
      // shop's sales channel) previously left the shop with NO webhooks.
      console.warn(`[printify] failed to register webhook topic "${topic}": ${err}`)
    }
  }
}

export const config: SubscriberConfig = {
  event: "app.started",
}
