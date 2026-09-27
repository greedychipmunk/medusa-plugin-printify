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
  const { shopId, webhookBaseUrl } = options

  if (!shopId || !webhookBaseUrl) {
    console.warn("[printify] webhook registration skipped: missing shopId or webhookBaseUrl")
    return
  }

  const client = service.getApiClient()
  const webhookUrl = `${webhookBaseUrl}/webhooks/printify`

  const existing = await client.getWebhooks(shopId)
  const existingTopics = existing.map(w => w.topic)

  for (const topic of WEBHOOK_TOPICS) {
    if (!existingTopics.includes(topic)) {
      try {
        await client.createWebhook(shopId, topic, webhookUrl)
        console.log(`[printify] registered webhook: ${topic}`)
      } catch (err) {
        // One rejected topic must not abort the whole loop — a single
        // Printify validation failure (e.g. topic not supported for the
        // shop's sales channel) previously left the shop with NO webhooks.
        console.warn(`[printify] failed to register webhook topic "${topic}": ${err}`)
      }
    }
  }
}

export const config: SubscriberConfig = {
  event: "app.started",
}
