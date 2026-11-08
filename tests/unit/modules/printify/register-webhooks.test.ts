import fs from "fs"
import path from "path"
import {
  WEBHOOK_TOPICS,
  desiredWebhookUrl,
  registerWebhooks,
  registerWebhooksWithTimeout,
  secretFingerprint,
} from "../../../../src/modules/printify/register-webhooks"

const mockGetWebhooks = jest.fn()
const mockCreateWebhook = jest.fn()
const mockDeleteWebhook = jest.fn()

const client = {
  getWebhooks: mockGetWebhooks,
  createWebhook: mockCreateWebhook,
  deleteWebhook: mockDeleteWebhook,
}

const base = { shopId: "shop1", webhookBaseUrl: "https://example.com" }
const PLAIN_URL = "https://example.com/webhooks/printify"
// sha256("sekrit").slice(0, 12)
const SIGNED_URL = "https://example.com/webhooks/printify?k=7e35aaaea6b8"

const hook = (id: string, topic: string, url: string) => ({ id, topic, url, shop_id: "shop1" })

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {})
  jest.spyOn(console, "warn").mockImplementation(() => {})
  mockCreateWebhook.mockResolvedValue({})
  mockDeleteWebhook.mockResolvedValue(undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe("WEBHOOK_TOPICS", () => {
  it("contains only real Printify event names", () => {
    // Printify rejects unknown topics with 9004 "Webhook validation failed".
    const printifyEvents = new Set([
      "order:created",
      "order:updated",
      "order:sent-to-production",
      "order:shipment:created",
      "order:shipment:delivered",
      "order:line-item:canceled",
      "product:publish:started",
      "product:updated",
      "product:deleted",
      "shop:disconnected",
    ])
    expect(WEBHOOK_TOPICS.filter(t => !printifyEvents.has(t))).toEqual([])
  })
})

describe("desiredWebhookUrl", () => {
  it("embeds a short fingerprint of the secret, not the secret", () => {
    expect(secretFingerprint("sekrit")).toBe("7e35aaaea6b8")
    expect(desiredWebhookUrl("https://example.com", "sekrit")).toBe(SIGNED_URL)
    expect(desiredWebhookUrl("https://example.com", "sekrit")).not.toContain("sekrit")
  })

  it("omits the fingerprint when no secret is configured", () => {
    expect(desiredWebhookUrl("https://example.com", "")).toBe(PLAIN_URL)
  })

  it("tolerates a trailing slash on the base URL", () => {
    expect(desiredWebhookUrl("https://example.com/", "sekrit")).toBe(SIGNED_URL)
  })
})

describe("registerWebhooks", () => {
  it("skips registration when shopId is missing", async () => {
    await registerWebhooks(client, { webhookBaseUrl: "https://example.com", webhookSecret: "s" })
    expect(mockGetWebhooks).not.toHaveBeenCalled()
  })

  it("skips registration when webhookBaseUrl is missing", async () => {
    await registerWebhooks(client, { shopId: "shop1", webhookSecret: "s" })
    expect(mockGetWebhooks).not.toHaveBeenCalled()
  })

  it("creates every topic with the fingerprinted URL and secret on an empty shop", async () => {
    mockGetWebhooks.mockResolvedValue([])

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    expect(mockGetWebhooks).toHaveBeenCalledWith("shop1")
    expect(mockCreateWebhook).toHaveBeenCalledTimes(WEBHOOK_TOPICS.length)
    for (const topic of WEBHOOK_TOPICS) {
      expect(mockCreateWebhook).toHaveBeenCalledWith("shop1", topic, SIGNED_URL, "sekrit")
    }
    expect(mockDeleteWebhook).not.toHaveBeenCalled()
  })

  it("replaces legacy un-fingerprinted webhooks, passing the required host", async () => {
    // The six prod webhooks created before secret support look exactly like this.
    mockGetWebhooks.mockResolvedValue([hook("wh1", "product:updated", PLAIN_URL)])

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    expect(mockDeleteWebhook).toHaveBeenCalledWith("shop1", "wh1", "example.com")
    expect(mockCreateWebhook).toHaveBeenCalledWith("shop1", "product:updated", SIGNED_URL, "sekrit")
    const del = mockDeleteWebhook.mock.invocationCallOrder[0]
    const create = mockCreateWebhook.mock.invocationCallOrder.find(
      (_, i) => mockCreateWebhook.mock.calls[i][1] === "product:updated"
    )!
    expect(del).toBeLessThan(create)
  })

  it("replaces webhooks signed with a rotated (old) secret", async () => {
    const oldUrl = desiredWebhookUrl("https://example.com", "old-secret")
    mockGetWebhooks.mockResolvedValue([hook("wh1", "product:updated", oldUrl)])

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    expect(mockDeleteWebhook).toHaveBeenCalledWith("shop1", "wh1", "example.com")
    expect(mockCreateWebhook).toHaveBeenCalledWith("shop1", "product:updated", SIGNED_URL, "sekrit")
  })

  it("makes no write calls when every topic already has the current URL", async () => {
    mockGetWebhooks.mockResolvedValue(
      WEBHOOK_TOPICS.map((topic, i) => hook(`wh${i}`, topic, SIGNED_URL))
    )

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    expect(mockCreateWebhook).not.toHaveBeenCalled()
    expect(mockDeleteWebhook).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(`${WEBHOOK_TOPICS.length} unchanged, 0 created, 0 replaced, 0 failed`)
    )
  })

  it("removes a stale duplicate but keeps the current webhook for a topic", async () => {
    mockGetWebhooks.mockResolvedValue([
      hook("current", "product:updated", SIGNED_URL),
      hook("legacy", "product:updated", PLAIN_URL),
    ])

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    expect(mockDeleteWebhook).toHaveBeenCalledWith("shop1", "legacy", "example.com")
    expect(mockDeleteWebhook).not.toHaveBeenCalledWith("shop1", "current", expect.anything())
    expect(mockCreateWebhook).not.toHaveBeenCalledWith(
      "shop1",
      "product:updated",
      expect.anything(),
      expect.anything()
    )
  })

  it("never touches webhooks that point at another host or path", async () => {
    mockGetWebhooks.mockResolvedValue([
      hook("other-host", "product:updated", "https://other-app.com/webhooks/printify"),
      hook("other-path", "product:updated", "https://example.com/hooks/elsewhere"),
    ])

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    expect(mockDeleteWebhook).not.toHaveBeenCalled()
    expect(mockCreateWebhook).toHaveBeenCalledWith("shop1", "product:updated", SIGNED_URL, "sekrit")
  })

  it("registers the plain URL without a secret when none is configured", async () => {
    mockGetWebhooks.mockResolvedValue([])

    await registerWebhooks(client, { ...base, webhookSecret: "" })

    expect(mockCreateWebhook).toHaveBeenCalledWith("shop1", "product:updated", PLAIN_URL, "")
  })

  it("continues with remaining topics when one fails, and counts the failure", async () => {
    mockGetWebhooks.mockResolvedValue([])
    mockCreateWebhook
      .mockRejectedValueOnce(new Error("Printify API error 9004"))
      .mockResolvedValue({})

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    expect(mockCreateWebhook).toHaveBeenCalledTimes(WEBHOOK_TOPICS.length)
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(`0 unchanged, ${WEBHOOK_TOPICS.length - 1} created, 0 replaced, 1 failed`)
    )
  })

  it("does not create a replacement when deleting the stale webhook fails", async () => {
    mockGetWebhooks.mockResolvedValue([hook("wh1", "product:updated", PLAIN_URL)])
    mockDeleteWebhook.mockRejectedValue(new Error("Printify API error 400"))

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    // Avoids two live webhooks (one unsigned) for the same topic.
    expect(mockCreateWebhook).not.toHaveBeenCalledWith(
      "shop1",
      "product:updated",
      expect.anything(),
      expect.anything()
    )
  })

  it("does not throw when listing webhooks fails", async () => {
    mockGetWebhooks.mockRejectedValue(new Error("network down"))

    await expect(registerWebhooks(client, { ...base, webhookSecret: "s" })).resolves.toBeUndefined()
    expect(mockCreateWebhook).not.toHaveBeenCalled()
  })
})

describe("registerWebhooksWithTimeout", () => {
  it("waits for registration to finish", async () => {
    mockGetWebhooks.mockResolvedValue([])

    await registerWebhooksWithTimeout(client, { ...base, webhookSecret: "sekrit" }, 1_000)

    expect(mockCreateWebhook).toHaveBeenCalledTimes(WEBHOOK_TOPICS.length)
  })

  it("stops waiting after the timeout when Printify hangs", async () => {
    jest.useFakeTimers()
    mockGetWebhooks.mockReturnValue(new Promise(() => {})) // never settles

    const done = registerWebhooksWithTimeout(client, { ...base, webhookSecret: "s" }, 5_000)
    jest.advanceTimersByTime(5_000)

    await expect(done).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("still running after 5000ms"))
  })
})

describe("startup trigger regression guard", () => {
  // Medusa v2 never emits `app.started`. A subscriber on it is dead code —
  // that is how webhook registration silently never ran in production.
  it("no subscriber listens for the nonexistent app.started event", () => {
    const dir = path.join(__dirname, "../../../../src/subscribers")
    const offenders = fs
      .readdirSync(dir)
      .filter(f => /\.(t|j)sx?$/.test(f))
      .filter(f => /["'`]app\.started["'`]/.test(fs.readFileSync(path.join(dir, f), "utf8")))
    expect(offenders).toEqual([])
  })
})
