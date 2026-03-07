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
      await client.createWebhook(shopId, topic, webhookUrl)
      console.log(`[printify] registered webhook: ${topic}`)
    }
  }
}

export const config: SubscriberConfig = {
  event: "app.started",
}
