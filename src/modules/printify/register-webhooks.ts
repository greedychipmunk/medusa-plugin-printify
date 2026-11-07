import type { PrintifyApiClient } from "./api-client"
import type { PrintifyModuleOptions } from "./types"

export const WEBHOOK_TOPICS = [
  "order:status-changed",
  "order:shipped",
  "order:sent-to-production",
  "order:shipment:delivered",
  "product:updated",
  "product:deleted",
  "product:publish:started",
  "shop:disconnected",
]

/**
 * Upper bound on how long application startup waits for registration.
 * Medusa awaits `onApplicationStart` before serving, and the Printify client
 * has no request timeout, so an unresponsive API must not stall boot.
 */
export const WEBHOOK_REGISTRATION_TIMEOUT_MS = 20_000

type WebhookClient = Pick<
  PrintifyApiClient,
  "getWebhooks" | "createWebhook" | "deleteWebhook"
>

type WebhookOptions = Pick<
  PrintifyModuleOptions,
  "shopId" | "webhookBaseUrl" | "webhookSecret"
>

/**
 * Ensure every topic in WEBHOOK_TOPICS is registered for the shop, and that
 * existing unsigned webhooks are replaced with signed ones when a secret is
 * configured. Idempotent: a second run against a fully signed shop is a no-op.
 * Never throws — failures are logged per topic so one rejection cannot leave
 * the shop without webhooks.
 */
export async function registerWebhooks(
  client: WebhookClient,
  options: WebhookOptions
): Promise<void> {
  const { shopId, webhookBaseUrl, webhookSecret } = options

  if (!shopId || !webhookBaseUrl) {
    console.warn("[printify] webhook registration skipped: missing shopId or webhookBaseUrl")
    return
  }

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
        // recreate fails, the next application start sees the topic as
        // missing and creates it.
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

/**
 * Run registration, but stop waiting after `timeoutMs`. Registration is
 * awaited (not fire-and-forget) because `medusa db:migrate` also invokes
 * `onApplicationStart` in a short-lived process: an unawaited run could be
 * cut off between deleting an unsigned webhook and recreating it.
 */
export async function registerWebhooksWithTimeout(
  client: WebhookClient,
  options: WebhookOptions,
  timeoutMs: number = WEBHOOK_REGISTRATION_TIMEOUT_MS
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<"timeout">(resolve => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs)
  })
  try {
    const result = await Promise.race([
      registerWebhooks(client, options).then(() => "done" as const),
      timeout,
    ])
    if (result === "timeout") {
      console.warn(
        `[printify] webhook registration still running after ${timeoutMs}ms; continuing startup without waiting`
      )
    }
  } catch (err) {
    console.warn(`[printify] webhook registration failed: ${err}`)
  } finally {
    clearTimeout(timer)
  }
}
