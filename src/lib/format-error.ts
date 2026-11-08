/**
 * Readable text for any thrown value.
 *
 * Medusa's `workflow.run()` rethrows a *serialized* error (a plain object with
 * `message`, `name`, `stack`, ...), not an `Error` instance. Both `${err}` and
 * `err instanceof Error ? err.message : String(err)` therefore print
 * "[object Object]" and lose the cause. Use these helpers instead.
 */

const MAX_BODY_CHARS = 500

function safeJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

function truncate(text: string): string {
  return text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}…` : text
}

/** One-line description: message (prefixed by a non-generic name) plus HTTP status/body for axios errors. */
export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err
  if (!err || typeof err !== "object") return String(err)

  const e = err as {
    name?: unknown
    message?: unknown
    response?: { status?: unknown; data?: unknown }
  }

  let text: string
  if (typeof e.message === "string" && e.message) {
    const prefixed = typeof e.name === "string" && e.name && e.name !== "Error" && !e.message.startsWith(e.name)
    text = prefixed ? `${e.name}: ${e.message}` : e.message
  } else {
    text = safeJson(err) ?? Object.prototype.toString.call(err)
  }

  const status = e.response?.status
  if (typeof status === "number") {
    const data = e.response?.data
    const body = data === undefined ? "" : ` ${truncate(safeJson(data) ?? String(data))}`
    text += ` (HTTP ${status}${body})`
  }
  return text
}

/** Stack trace when the thrown value carries one (Errors and Medusa-serialized errors do). */
export function errorStack(err: unknown): string | undefined {
  const stack = err && typeof err === "object" ? (err as { stack?: unknown }).stack : undefined
  return typeof stack === "string" && stack ? stack : undefined
}
