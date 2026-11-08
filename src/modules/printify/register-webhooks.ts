import { createHash } from "crypto"
import type { PrintifyApiClient, PrintifyWebhook } from "./api-client"
import type { PrintifyModuleOptions } from "./types"
import { errorMessage } from "../../lib/format-error"

/**
 * Topics registered with Printify. Every entry must be a real Printify event
 * name (see developers.printify.com "Events"); unknown names are rejected with
 * error 9004 "Webhook validation failed".
 */
export const WEBHOOK_TOPICS = [
  "order:updated",
  "order:sent-to-production",
  "order:shipment:created",
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
 * Short, non-reversible fingerprint of the signing secret, embedded in the
 * webhook URL as `?k=`. Printify never returns a webhook's secret, so the URL
 * is the only observable record of which secret a webhook was signed with.
 */
export function secretFingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12)
}

/** The URL every registered webhook should point at for the current secret. */
export function desiredWebhookUrl(webhookBaseUrl: string, webhookSecret?: string): string {
  const base = `${webhookBaseUrl.replace(/\/+$/, "")}/webhooks/printify`
  return webhookSecret ? `${base}?k=${secretFingerprint(webhookSecret)}` : base
}

/** True when the webhook targets this app's endpoint (any `?k=`, or none). */
function isOurs(webhook: PrintifyWebhook, desiredUrl: string): boolean {
  return webhook.url.split("?")[0] === desiredUrl.split("?")[0]
}

/**
 * Ensure every topic in WEBHOOK_TOPICS has exactly one webhook pointing at
 * `desiredWebhookUrl`. Webhooks for this endpoint with a different (or no)
 * secret fingerprint — legacy unsigned ones, or ones signed with a rotated
 * secret — are deleted and recreated. Webhooks for other hosts/paths are
 * never touched. Idempotent: a second run against an up-to-date shop makes
 * no write calls. Never throws — failures are logged per topic so one
 * rejection cannot leave the shop without webhooks.
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

  const webhookUrl = desiredWebhookUrl(webhookBaseUrl, webhookSecret)

  let existing: PrintifyWebhook[]
  try {
    existing = await client.getWebhooks(shopId)
  } catch (err) {
    console.warn(`[printify] failed to list existing webhooks: ${errorMessage(err)}`)
    return
  }

  const counts = { unchanged: 0, created: 0, replaced: 0, failed: 0 }

  for (const topic of WEBHOOK_TOPICS) {
    const ours = existing.filter(w => w.topic === topic && isOurs(w, webhookUrl))
    const current = ours.find(w => w.url === webhookUrl)
    const stale = ours.filter(w => w.url !== webhookUrl)
    try {
      // Delete before create: a failed create leaves the topic missing, and
      // the next application start creates it.
      for (const w of stale) {
        await client.deleteWebhook(shopId, w.id, new URL(w.url).host)
      }
      if (current) {
        counts.unchanged++
      } else {
        await client.createWebhook(shopId, topic, webhookUrl, webhookSecret)
        if (stale.length) {
          counts.replaced++
          console.log(`[printify] re-registered webhook with current secret: ${topic}`)
        } else {
          counts.created++
          console.log(`[printify] registered webhook: ${topic}`)
        }
      }
    } catch (err) {
      // One rejected topic must not abort the whole loop — a single
      // Printify validation failure (e.g. topic not supported for the
      // shop's sales channel) previously left the shop with NO webhooks.
      counts.failed++
      console.warn(`[printify] failed to register webhook topic "${topic}": ${errorMessage(err)}`)
    }
  }

  console.log(
    `[printify] webhook registration complete: ${counts.unchanged} unchanged, ` +
      `${counts.created} created, ${counts.replaced} replaced, ${counts.failed} failed`
  )
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
    console.warn(`[printify] webhook registration failed: ${errorMessage(err)}`)
  } finally {
    clearTimeout(timer)
  }
}
