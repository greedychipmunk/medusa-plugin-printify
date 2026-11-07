import fs from "fs"
import path from "path"
import {
  WEBHOOK_TOPICS,
  registerWebhooks,
  registerWebhooksWithTimeout,
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

describe("registerWebhooks", () => {
  it("skips registration when shopId is missing", async () => {
    await registerWebhooks(client, { webhookBaseUrl: "https://example.com", webhookSecret: "s" })
    expect(mockGetWebhooks).not.toHaveBeenCalled()
  })

  it("skips registration when webhookBaseUrl is missing", async () => {
    await registerWebhooks(client, { shopId: "shop1", webhookSecret: "s" })
    expect(mockGetWebhooks).not.toHaveBeenCalled()
  })

  it("registers missing webhook topics", async () => {
    mockGetWebhooks.mockResolvedValue([{ id: "wh0", topic: "order:shipped" }])

    await registerWebhooks(client, { ...base, webhookSecret: "" })

    expect(mockGetWebhooks).toHaveBeenCalledWith("shop1")
    expect(mockCreateWebhook).toHaveBeenCalledTimes(WEBHOOK_TOPICS.length - 1)
    expect(mockCreateWebhook).not.toHaveBeenCalledWith(
      "shop1",
      "order:shipped",
      expect.anything(),
      expect.anything()
    )
    expect(mockCreateWebhook).toHaveBeenCalledWith(
      "shop1",
      "order:status-changed",
      "https://example.com/webhooks/printify",
      ""
    )
  })

  it("passes the webhook secret when creating webhooks", async () => {
    mockGetWebhooks.mockResolvedValue([])

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    expect(mockCreateWebhook).toHaveBeenCalledWith(
      "shop1",
      "order:status-changed",
      "https://example.com/webhooks/printify",
      "sekrit"
    )
  })

  it("replaces existing unsigned webhooks when a secret is configured", async () => {
    mockGetWebhooks.mockResolvedValue([{ id: "wh1", topic: "order:shipped", secret: "" }])

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    expect(mockDeleteWebhook).toHaveBeenCalledWith("shop1", "wh1")
    expect(mockCreateWebhook).toHaveBeenCalledWith(
      "shop1",
      "order:shipped",
      "https://example.com/webhooks/printify",
      "sekrit"
    )
  })

  it("leaves existing signed webhooks untouched", async () => {
    mockGetWebhooks.mockResolvedValue([{ id: "wh1", topic: "order:shipped", secret: "existing" }])

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    expect(mockDeleteWebhook).not.toHaveBeenCalled()
    expect(mockCreateWebhook).not.toHaveBeenCalledWith(
      "shop1",
      "order:shipped",
      expect.anything(),
      expect.anything()
    )
  })

  it("is a no-op when every topic is already registered and signed", async () => {
    mockGetWebhooks.mockResolvedValue(
      WEBHOOK_TOPICS.map((topic, i) => ({ id: `wh${i}`, topic, secret: "existing" }))
    )

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    expect(mockCreateWebhook).not.toHaveBeenCalled()
    expect(mockDeleteWebhook).not.toHaveBeenCalled()
  })

  it("continues registering remaining topics when one fails", async () => {
    // A single Printify validation rejection (e.g. unsupported topic for the
    // shop's sales channel) must not abort the loop — previously it left the
    // shop with NO webhooks registered at all.
    mockGetWebhooks.mockResolvedValue([])
    mockCreateWebhook
      .mockRejectedValueOnce(new Error("Printify API error 9004"))
      .mockResolvedValue({})

    await registerWebhooks(client, { ...base, webhookSecret: "sekrit" })

    expect(mockCreateWebhook).toHaveBeenCalledTimes(WEBHOOK_TOPICS.length)
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
