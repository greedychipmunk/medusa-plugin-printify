import registerWebhooksHandler from "../../../src/subscribers/plugin-registered"

const mockGetWebhooks = jest.fn()
const mockCreateWebhook = jest.fn()
const mockGetOptions = jest.fn()
const mockGetApiClient = jest.fn()

const mockService = {
  getOptions: mockGetOptions,
  getApiClient: mockGetApiClient,
}

const mockContainer = {
  resolve: jest.fn(),
}

beforeEach(() => {
  mockContainer.resolve.mockReturnValue(mockService)
  mockGetApiClient.mockReturnValue({
    getWebhooks: mockGetWebhooks,
    createWebhook: mockCreateWebhook,
  })
})

describe("registerWebhooksHandler", () => {
  it("skips registration when shopId is missing", async () => {
    mockGetOptions.mockReturnValue({ webhookBaseUrl: "https://example.com" })
    await registerWebhooksHandler({ container: mockContainer } as any)
    expect(mockGetWebhooks).not.toHaveBeenCalled()
  })

  it("skips registration when webhookBaseUrl is missing", async () => {
    mockGetOptions.mockReturnValue({ shopId: "shop1" })
    await registerWebhooksHandler({ container: mockContainer } as any)
    expect(mockGetWebhooks).not.toHaveBeenCalled()
  })

  it("registers missing webhook topics", async () => {
    mockGetOptions.mockReturnValue({
      shopId: "shop1",
      webhookBaseUrl: "https://example.com",
    })
    mockGetWebhooks.mockResolvedValue([
      { topic: "order:shipped" },
    ])
    mockCreateWebhook.mockResolvedValue({})

    await registerWebhooksHandler({ container: mockContainer } as any)

    expect(mockGetWebhooks).toHaveBeenCalledWith("shop1")
    expect(mockCreateWebhook).not.toHaveBeenCalledWith("shop1", "order:shipped", expect.any(String))
    expect(mockCreateWebhook).toHaveBeenCalledTimes(6)
    expect(mockCreateWebhook).toHaveBeenCalledWith(
      "shop1",
      "order:status-changed",
      "https://example.com/webhooks/printify"
    )
  })

  it("does not create webhooks that already exist", async () => {
    const allTopics = [
      "order:status-changed", "order:shipped", "order:sent-to-production",
      "order:shipment:delivered", "product:updated", "product:deleted", "shop:disconnected",
    ]
    mockGetOptions.mockReturnValue({
      shopId: "shop1",
      webhookBaseUrl: "https://example.com",
    })
    mockGetWebhooks.mockResolvedValue(allTopics.map(topic => ({ topic })))

    await registerWebhooksHandler({ container: mockContainer } as any)

    expect(mockCreateWebhook).not.toHaveBeenCalled()
  })
})
