# Printify Plugin Complete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete Medusa v2 plugin that syncs Printify products, submits orders to Printify for fulfillment, handles Printify webhooks, and surfaces Printify management in the Medusa Admin dashboard.

**Architecture:** The plugin wraps the Printify REST API via a typed axios client (`PrintifyApiClient`), stores Printify-specific data (shops, products, orders) in a custom Medusa module, and wires into Medusa's event/workflow system. Orders placed in Medusa trigger a subscriber that auto-submits to Printify. A webhook endpoint receives real-time status updates from Printify and emits Medusa events. The Medusa Admin gets new pages and widgets for managing Printify configuration and monitoring order fulfillment.

**Tech Stack:** TypeScript, Medusa v2.12.x (modules, workflows, subscribers, jobs, admin SDK), Printify REST API v1, axios, Jest, React 18 + @medusajs/ui

---

## Reference

- Printify API base: `https://api.printify.com/v1/`
- Auth header: `Authorization: Bearer {PRINTIFY_API_KEY}`
- Webhook secret header: `x-pfy-signature`
- Medusa module key constant: `PRINTIFY_MODULE = "printify"`
- Plugin options flow: `medusa-config.ts → plugin options → module options → `PrintifyModuleService.__joinerConfig`

---

## Phase 1 — Test Infrastructure & Printify API Client

### Task 1: Set up Jest

**Files:**
- Create: `jest.config.ts`
- Create: `jest.setup.ts`
- Modify: `package.json` (add jest deps + test script)

**Step 1: Install test dependencies**

```bash
npm install --save-dev jest ts-jest @types/jest jest-mock-extended
```

**Step 2: Create `jest.config.ts`**

```ts
import type { Config } from "jest"

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  resetMocks: true,
  setupFilesAfterFramework: ["./jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: [
    "<rootDir>/tests/**/*.test.ts",
  ],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
}

export default config
```

**Step 3: Create `jest.setup.ts`**

```ts
// Global test setup - intentionally empty for now
```

**Step 4: Add `test` script to `package.json`**

In the `"scripts"` field, add:
```json
"test": "jest",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage"
```

**Step 5: Verify jest works**

```bash
npx jest --listTests
```

Expected: no output / empty list (no tests yet).

**Step 6: Commit**

```bash
git add jest.config.ts jest.setup.ts package.json package-lock.json
git commit -m "chore: set up Jest testing infrastructure"
```

---

### Task 2: Printify API Client — Core

**Files:**
- Create: `src/modules/printify/api-client.ts`
- Create: `tests/unit/modules/printify/api-client.test.ts`

**Step 1: Write failing tests**

```ts
// tests/unit/modules/printify/api-client.test.ts
import axios from "axios"
import { PrintifyApiClient } from "../../../../src/modules/printify/api-client"

jest.mock("axios", () => ({
  __esModule: true,
  default: { create: jest.fn() },
}))

let mockAxiosInstance: { get: jest.Mock; post: jest.Mock; put: jest.Mock; delete: jest.Mock }

beforeEach(() => {
  mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  }
  ;(axios.create as jest.Mock).mockReturnValue(mockAxiosInstance)
})

describe("PrintifyApiClient", () => {
  it("creates axios instance with correct base config", () => {
    new PrintifyApiClient("test-api-key")
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: "https://api.printify.com/v1",
      headers: {
        Authorization: "Bearer test-api-key",
        "Content-Type": "application/json",
      },
    })
  })

  it("getShops returns shops array", async () => {
    const client = new PrintifyApiClient("key")
    mockAxiosInstance.get.mockResolvedValue({ data: [{ id: "123", title: "My Shop" }] })
    const result = await client.getShops()
    expect(mockAxiosInstance.get).toHaveBeenCalledWith("/shops.json")
    expect(result).toEqual([{ id: "123", title: "My Shop" }])
  })
})
```

**Step 2: Run to verify they fail**

```bash
npx jest tests/unit/modules/printify/api-client.test.ts
```

Expected: FAIL — `Cannot find module '../../../../src/modules/printify/api-client'`

**Step 3: Create `src/modules/printify/api-client.ts`**

```ts
import axios, { AxiosInstance } from "axios"

export type PrintifyShop = {
  id: string
  title: string
  sales_channel?: string
}

export type PrintifyProduct = {
  id: string
  title: string
  description: string
  variants: PrintifyVariant[]
  images: PrintifyImage[]
  print_areas: Record<string, unknown>[]
  is_locked: boolean
}

export type PrintifyVariant = {
  id: number
  sku: string
  cost: number
  price: number
  title: string
  is_enabled: boolean
  is_default: boolean
  options: number[]
  quantity?: number
}

export type PrintifyImage = {
  src: string
  position: string
  is_default: boolean
}

export type PrintifyOrderLineItem = {
  product_id: string
  variant_id: number
  quantity: number
}

export type PrintifyAddress = {
  first_name: string
  last_name: string
  email: string
  phone: string
  country: string
  region: string
  address1: string
  address2?: string
  city: string
  zip: string
}

export type PrintifyShippingMethod = {
  id: number
  name: string
}

export type PrintifyCreateOrderPayload = {
  external_id: string
  label: string
  line_items: PrintifyOrderLineItem[]
  shipping_method: number
  send_shipping_notification: boolean
  address_to: PrintifyAddress
}

export type PrintifyOrder = {
  id: string
  status: string
  shipping_method: number
  line_items: PrintifyOrderLineItem[]
  address_to: PrintifyAddress
  total_price: number
  total_shipping: number
  total_tax: number
  shipments?: PrintifyShipment[]
}

export type PrintifyShipment = {
  carrier: string
  number: string
  url: string
  delivered_at: string | null
}

export type PrintifyWebhook = {
  id: string
  topic: string
  url: string
  shop_id: string
  secret: string
}

export class PrintifyApiClient {
  private client: AxiosInstance

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: "https://api.printify.com/v1",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    })
  }

  // Shops
  async getShops(): Promise<PrintifyShop[]> {
    const { data } = await this.client.get("/shops.json")
    return data
  }

  // Products
  async getProducts(shopId: string, page = 1, limit = 100): Promise<{ data: PrintifyProduct[]; current_page: number; last_page: number }> {
    const { data } = await this.client.get(`/shops/${shopId}/products.json`, {
      params: { page, limit },
    })
    return data
  }

  async getProduct(shopId: string, productId: string): Promise<PrintifyProduct> {
    const { data } = await this.client.get(`/shops/${shopId}/products/${productId}.json`)
    return data
  }

  // Orders
  async createOrder(shopId: string, payload: PrintifyCreateOrderPayload): Promise<PrintifyOrder> {
    const { data } = await this.client.post(`/shops/${shopId}/orders.json`, payload)
    return data
  }

  async submitOrder(shopId: string, orderId: string): Promise<PrintifyOrder> {
    const { data } = await this.client.post(`/shops/${shopId}/orders/${orderId}/send_to_production.json`)
    return data
  }

  async getOrder(shopId: string, orderId: string): Promise<PrintifyOrder> {
    const { data } = await this.client.get(`/shops/${shopId}/orders/${orderId}.json`)
    return data
  }

  async calculateShipping(shopId: string, payload: { line_items: PrintifyOrderLineItem[]; address_to: PrintifyAddress }): Promise<{ standard: number; express: number; priority: number; printify_express: number; economy: number }> {
    const { data } = await this.client.post(`/shops/${shopId}/orders/shipping.json`, payload)
    return data
  }

  // Webhooks
  async getWebhooks(shopId: string): Promise<PrintifyWebhook[]> {
    const { data } = await this.client.get(`/shops/${shopId}/webhooks.json`)
    return data
  }

  async createWebhook(shopId: string, topic: string, url: string): Promise<PrintifyWebhook> {
    const { data } = await this.client.post(`/shops/${shopId}/webhooks.json`, { topic, url })
    return data
  }

  async deleteWebhook(shopId: string, webhookId: string): Promise<void> {
    await this.client.delete(`/shops/${shopId}/webhooks/${webhookId}.json`)
  }
}
```

**Step 4: Run tests**

```bash
npx jest tests/unit/modules/printify/api-client.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/modules/printify/api-client.ts tests/unit/modules/printify/api-client.test.ts
git commit -m "feat: add PrintifyApiClient with typed Printify API methods"
```

---

### Task 3: Extend API Client Tests (Products, Orders, Webhooks)

**Files:**
- Modify: `tests/unit/modules/printify/api-client.test.ts`

**Step 1: Add tests for remaining methods**

Add to the existing test file inside `describe("PrintifyApiClient")`:

```ts
it("getProducts paginates correctly", async () => {
  const client = new PrintifyApiClient("key")
  const mockResponse = { data: [], current_page: 1, last_page: 1 }
  mockAxiosInstance.get.mockResolvedValue({ data: mockResponse })
  const result = await client.getProducts("shop1", 2, 50)
  expect(mockAxiosInstance.get).toHaveBeenCalledWith("/shops/shop1/products.json", {
    params: { page: 2, limit: 50 },
  })
  expect(result).toEqual(mockResponse)
})

it("createOrder posts to correct endpoint", async () => {
  const client = new PrintifyApiClient("key")
  const payload = {
    external_id: "order-123",
    label: "Order #123",
    line_items: [{ product_id: "p1", variant_id: 1, quantity: 1 }],
    shipping_method: 1,
    send_shipping_notification: false,
    address_to: {
      first_name: "Jane", last_name: "Doe", email: "j@e.com",
      phone: "555-0100", country: "US", region: "CA",
      address1: "1 Main St", city: "SF", zip: "94105",
    },
  }
  mockAxiosInstance.post.mockResolvedValue({ data: { id: "printify-order-1", status: "pending" } })
  const result = await client.createOrder("shop1", payload)
  expect(mockAxiosInstance.post).toHaveBeenCalledWith("/shops/shop1/orders.json", payload)
  expect(result.id).toBe("printify-order-1")
})

it("submitOrder sends to production", async () => {
  const client = new PrintifyApiClient("key")
  mockAxiosInstance.post.mockResolvedValue({ data: { id: "po1", status: "in-production" } })
  const result = await client.submitOrder("shop1", "po1")
  expect(mockAxiosInstance.post).toHaveBeenCalledWith("/shops/shop1/orders/po1/send_to_production.json")
  expect(result.status).toBe("in-production")
})

it("createWebhook registers webhook topic", async () => {
  const client = new PrintifyApiClient("key")
  const webhook = { id: "wh1", topic: "order:shipped", url: "https://mystore.com/webhooks/printify", shop_id: "s1", secret: "sec" }
  mockAxiosInstance.post.mockResolvedValue({ data: webhook })
  const result = await client.createWebhook("shop1", "order:shipped", "https://mystore.com/webhooks/printify")
  expect(result.topic).toBe("order:shipped")
})
```

**Step 2: Run tests**

```bash
npx jest tests/unit/modules/printify/api-client.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add tests/unit/modules/printify/api-client.test.ts
git commit -m "test: expand PrintifyApiClient test coverage for all endpoints"
```

---

## Phase 2 — Printify Module

### Task 4: Data Models

**Files:**
- Create: `src/modules/printify/models/shop.ts`
- Create: `src/modules/printify/models/product.ts`
- Create: `src/modules/printify/models/order.ts`

> No unit test for DML models — they're validated via integration tests and migrations. Models are pure schema definitions.

**Step 1: Create `src/modules/printify/models/shop.ts`**

```ts
import { model } from "@medusajs/framework/utils"

const PrintifyShop = model.define("printify_shop", {
  id: model.id().primaryKey(),
  printify_id: model.text(),
  title: model.text(),
  sales_channel_id: model.text().nullable(),
})

export default PrintifyShop
```

**Step 2: Create `src/modules/printify/models/product.ts`**

```ts
import { model } from "@medusajs/framework/utils"

const PrintifyProduct = model.define("printify_product", {
  id: model.id().primaryKey(),
  printify_id: model.text(),
  shop_id: model.text(),
  title: model.text(),
  description: model.text(),
  variants: model.json(),
  images: model.json(),
  print_areas: model.json(),
  is_published: model.boolean().default(false),
  printify_data: model.json().nullable(),
})

export default PrintifyProduct
```

**Step 3: Create `src/modules/printify/models/order.ts`**

```ts
import { model } from "@medusajs/framework/utils"

const PrintifyOrder = model.define("printify_order", {
  id: model.id().primaryKey(),
  printify_id: model.text().nullable(),
  shop_id: model.text(),
  medusa_order_id: model.text().nullable(),
  status: model.text().default("pending"),
  shipping_method: model.text().nullable(),
  line_items: model.json(),
  address_to: model.json(),
  total_cost: model.number().nullable(),
  cost_per_item: model.json().nullable(),
  submitted_at: model.dateTime().nullable(),
})

export default PrintifyOrder
```

**Step 4: Commit**

```bash
git add src/modules/printify/models/
git commit -m "feat: add PrintifyShop, PrintifyProduct, PrintifyOrder DML models"
```

---

### Task 5: Module Service

**Files:**
- Create: `src/modules/printify/service.ts`
- Create: `src/modules/printify/types.ts`
- Create: `tests/unit/modules/printify/service.test.ts`

**Step 1: Create `src/modules/printify/types.ts`**

```ts
export type PrintifyModuleOptions = {
  apiKey: string
  webhookSecret: string
  shopId?: string
  enableNotifications?: boolean
  notificationEmail?: string
}
```

**Step 2: Write failing service tests**

```ts
// tests/unit/modules/printify/service.test.ts
import { PrintifyModuleService } from "../../../../src/modules/printify/service"
import { MedusaService } from "@medusajs/framework/utils"

jest.mock("@medusajs/framework/utils", () => ({
  MedusaService: jest.fn().mockReturnValue(
    class MockBase {
      listPrintifyShops = jest.fn()
      createPrintifyShops = jest.fn()
      updatePrintifyShops = jest.fn()
      listPrintifyProducts = jest.fn()
      createPrintifyProducts = jest.fn()
      updatePrintifyProducts = jest.fn()
      listPrintifyOrders = jest.fn()
      createPrintifyOrders = jest.fn()
      updatePrintifyOrders = jest.fn()
    }
  ),
  model: {
    define: jest.fn(),
    id: jest.fn(() => ({ primaryKey: jest.fn().mockReturnThis() })),
    text: jest.fn(() => ({ nullable: jest.fn().mockReturnThis(), unique: jest.fn().mockReturnThis() })),
    boolean: jest.fn(() => ({ default: jest.fn().mockReturnThis() })),
    json: jest.fn(() => ({ nullable: jest.fn().mockReturnThis() })),
    number: jest.fn(() => ({ nullable: jest.fn().mockReturnThis() })),
    dateTime: jest.fn(() => ({ nullable: jest.fn().mockReturnThis() })),
  },
}))

describe("PrintifyModuleService", () => {
  let service: PrintifyModuleService

  beforeEach(() => {
    const options = { apiKey: "test-key", webhookSecret: "secret" }
    service = new PrintifyModuleService({}, { options })
  })

  it("instantiates with module options", () => {
    expect(service).toBeDefined()
  })

  it("exposes getApiClient method", () => {
    expect(service.getApiClient()).toBeDefined()
  })

  it("getOptions returns module options", () => {
    const opts = service.getOptions()
    expect(opts.apiKey).toBe("test-key")
    expect(opts.webhookSecret).toBe("secret")
  })
})
```

**Step 3: Run to verify failure**

```bash
npx jest tests/unit/modules/printify/service.test.ts
```

Expected: FAIL — module not found

**Step 4: Create `src/modules/printify/service.ts`**

```ts
import { MedusaService } from "@medusajs/framework/utils"
import { PrintifyApiClient } from "./api-client"
import { PrintifyModuleOptions } from "./types"
import PrintifyShop from "./models/shop"
import PrintifyProduct from "./models/product"
import PrintifyOrder from "./models/order"

type InjectedDependencies = Record<string, never>

class PrintifyModuleService extends MedusaService({
  PrintifyShop,
  PrintifyProduct,
  PrintifyOrder,
}) {
  private apiClient: PrintifyApiClient
  private options: PrintifyModuleOptions

  constructor(container: InjectedDependencies, moduleOptions: { options: PrintifyModuleOptions }) {
    super(...arguments)
    this.options = moduleOptions.options
    this.apiClient = new PrintifyApiClient(moduleOptions.options.apiKey)
  }

  getApiClient(): PrintifyApiClient {
    return this.apiClient
  }

  getOptions(): PrintifyModuleOptions {
    return this.options
  }
}

export { PrintifyModuleService }
export default PrintifyModuleService
```

**Step 5: Run tests**

```bash
npx jest tests/unit/modules/printify/service.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/modules/printify/service.ts src/modules/printify/types.ts tests/unit/modules/printify/service.test.ts
git commit -m "feat: add PrintifyModuleService extending MedusaService"
```

---

### Task 6: Module Index + Registration

**Files:**
- Create: `src/modules/printify/index.ts`
- Create: `tests/integration/helpers/test-service-factory.ts`

**Step 1: Create `src/modules/printify/index.ts`**

```ts
import { Module } from "@medusajs/framework/utils"
import PrintifyModuleService from "./service"

export const PRINTIFY_MODULE = "printify"

export default Module(PRINTIFY_MODULE, {
  service: PrintifyModuleService,
})
```

**Step 2: Create integration test helper**

```ts
// tests/integration/helpers/test-service-factory.ts
import { PrintifyModuleService } from "../../../src/modules/printify/service"
import { PrintifyModuleOptions } from "../../../src/modules/printify/types"

// In-memory store for integration tests
const createStore = () => {
  const store: Record<string, Record<string, unknown>[]> = {
    printify_shop: [],
    printify_product: [],
    printify_order: [],
  }

  const makeId = () => Math.random().toString(36).slice(2)

  const crud = (table: string) => ({
    list: async (filters = {}) => store[table].filter(item =>
      Object.entries(filters).every(([k, v]) => (item as Record<string, unknown>)[k] === v)
    ),
    create: async (data: Record<string, unknown> | Record<string, unknown>[]) => {
      const items = Array.isArray(data) ? data : [data]
      const created = items.map(d => ({ id: makeId(), ...d }))
      store[table].push(...created)
      return Array.isArray(data) ? created : created[0]
    },
    update: async (selector: Record<string, unknown>, data: Record<string, unknown>) => {
      store[table] = store[table].map(item =>
        Object.entries(selector).every(([k, v]) => (item as Record<string, unknown>)[k] === v)
          ? { ...item, ...data }
          : item
      )
    },
    delete: async (selector: Record<string, unknown>) => {
      store[table] = store[table].filter(item =>
        !Object.entries(selector).every(([k, v]) => (item as Record<string, unknown>)[k] === v)
      )
    },
  })

  return { store, crud }
}

export function createTestService(options: Partial<PrintifyModuleOptions> = {}) {
  const { store, crud } = createStore()

  const defaultOptions: PrintifyModuleOptions = {
    apiKey: "test-api-key",
    webhookSecret: "test-secret",
    ...options,
  }

  // Mock MedusaService base so we can inject in-memory stores
  jest.mock("@medusajs/framework/utils", () => {
    const actual = jest.requireActual("@medusajs/framework/utils")
    return {
      ...actual,
      MedusaService: jest.fn().mockReturnValue(
        class MockBase {
          listPrintifyShops = jest.fn(async (f = {}) => crud("printify_shop").list(f))
          createPrintifyShops = jest.fn(async (d: Record<string, unknown>[]) => crud("printify_shop").create(d))
          updatePrintifyShops = jest.fn(async (sel: Record<string, unknown>, d: Record<string, unknown>) => crud("printify_shop").update(sel, d))
          listPrintifyProducts = jest.fn(async (f = {}) => crud("printify_product").list(f))
          createPrintifyProducts = jest.fn(async (d: Record<string, unknown>[]) => crud("printify_product").create(d))
          updatePrintifyProducts = jest.fn(async (sel: Record<string, unknown>, d: Record<string, unknown>) => crud("printify_product").update(sel, d))
          listPrintifyOrders = jest.fn(async (f = {}) => crud("printify_order").list(f))
          createPrintifyOrders = jest.fn(async (d: Record<string, unknown>[]) => crud("printify_order").create(d))
          updatePrintifyOrders = jest.fn(async (sel: Record<string, unknown>, d: Record<string, unknown>) => crud("printify_order").update(sel, d))
        }
      ),
    }
  })

  const service = new PrintifyModuleService({}, { options: defaultOptions })
  return { service, store, options: defaultOptions }
}
```

**Step 3: Commit**

```bash
git add src/modules/printify/index.ts tests/integration/helpers/test-service-factory.ts
git commit -m "feat: register PrintifyModule and add integration test factory"
```

---

## Phase 3 — Sync Workflows

### Task 7: Sync Shops Workflow

**Files:**
- Create: `src/workflows/sync-shops.ts`
- Create: `tests/unit/workflows/sync-shops.test.ts`

**Step 1: Write failing test**

```ts
// tests/unit/workflows/sync-shops.test.ts
import { syncShopsWorkflow } from "../../../src/workflows/sync-shops"

describe("syncShopsWorkflow", () => {
  it("is defined and has a run method", () => {
    // Workflow is a constructor - check it has the expected shape
    expect(syncShopsWorkflow).toBeDefined()
  })
})
```

**Step 2: Run to verify failure**

```bash
npx jest tests/unit/workflows/sync-shops.test.ts
```

Expected: FAIL

**Step 3: Create `src/workflows/sync-shops.ts`**

```ts
import {
  createWorkflow,
  createStep,
  WorkflowResponse,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { PrintifyShop as ApiShop } from "../modules/printify/api-client"

type SyncShopsInput = {
  shopId?: string
}

type SyncShopsOutput = {
  synced: number
}

const fetchShopsStep = createStep(
  "fetch-shops-step",
  async (_input: SyncShopsInput, { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
    const shops = await service.getApiClient().getShops()
    return new StepResponse(shops)
  }
)

const upsertShopsStep = createStep(
  "upsert-shops-step",
  async (shops: ApiShop[], { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)

    for (const shop of shops) {
      const existing = await service.listPrintifyShops({ printify_id: shop.id })
      if (existing.length > 0) {
        await service.updatePrintifyShops({ printify_id: shop.id }, { title: shop.title })
      } else {
        await service.createPrintifyShops([{ printify_id: shop.id, title: shop.title }])
      }
    }

    return new StepResponse({ synced: shops.length })
  }
)

export const syncShopsWorkflow = createWorkflow(
  "sync-printify-shops",
  (input: SyncShopsInput) => {
    const shops = fetchShopsStep(input)
    const result = upsertShopsStep(shops)
    return new WorkflowResponse(result)
  }
)
```

**Step 4: Run tests**

```bash
npx jest tests/unit/workflows/sync-shops.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/workflows/sync-shops.ts tests/unit/workflows/sync-shops.test.ts
git commit -m "feat: add syncShopsWorkflow to sync Printify shops to DB"
```

---

### Task 8: Sync Products Workflow + Job

**Files:**
- Create: `src/workflows/sync-products.ts`
- Create: `src/jobs/sync-products-job.ts`
- Create: `tests/unit/workflows/sync-products.test.ts`
- Create: `tests/unit/jobs/sync-products-job.test.ts`

**Step 1: Write workflow test**

```ts
// tests/unit/workflows/sync-products.test.ts
import { syncProductsWorkflow } from "../../../src/workflows/sync-products"

describe("syncProductsWorkflow", () => {
  it("exports a workflow", () => {
    expect(syncProductsWorkflow).toBeDefined()
  })
})
```

**Step 2: Create `src/workflows/sync-products.ts`**

```ts
import {
  createWorkflow,
  createStep,
  WorkflowResponse,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"

type SyncProductsInput = {
  shopId: string
}

type SyncProductsOutput = {
  synced: number
}

const fetchAllProductsStep = createStep(
  "fetch-all-products-step",
  async ({ shopId }: SyncProductsInput, { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
    const client = service.getApiClient()

    const products = []
    let page = 1
    let lastPage = 1

    do {
      const response = await client.getProducts(shopId, page, 100)
      products.push(...response.data)
      lastPage = response.last_page
      page++
    } while (page <= lastPage)

    return new StepResponse(products)
  }
)

const upsertProductsStep = createStep(
  "upsert-products-step",
  async ({ products, shopId }: { products: Awaited<ReturnType<InstanceType<typeof PrintifyModuleService>["getApiClient"]>["getProducts"]>["data"]; shopId: string }, { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)

    for (const product of products) {
      const existing = await service.listPrintifyProducts({ printify_id: product.id })
      const data = {
        printify_id: product.id,
        shop_id: shopId,
        title: product.title,
        description: product.description,
        variants: product.variants,
        images: product.images,
        print_areas: product.print_areas,
        printify_data: product,
      }
      if (existing.length > 0) {
        await service.updatePrintifyProducts({ printify_id: product.id }, data)
      } else {
        await service.createPrintifyProducts([data])
      }
    }

    return new StepResponse({ synced: products.length })
  }
)

export const syncProductsWorkflow = createWorkflow(
  "sync-printify-products",
  (input: SyncProductsInput) => {
    const products = fetchAllProductsStep(input)
    const result = upsertProductsStep({ products, shopId: input.shopId })
    return new WorkflowResponse(result)
  }
)
```

**Step 3: Write job test**

```ts
// tests/unit/jobs/sync-products-job.test.ts
import { syncProductsWorkflow } from "../../../src/workflows/sync-products"
import { PRINTIFY_MODULE } from "../../../src/modules/printify"

jest.mock("../../../src/workflows/sync-products", () => ({
  __esModule: true,
  syncProductsWorkflow: jest.fn(),
}))

const mockRun = jest.fn()

describe("sync-products-job", () => {
  let mockContainer: Record<string, jest.Mock>
  let mockService: { getOptions: jest.Mock }

  beforeEach(() => {
    ;(syncProductsWorkflow as jest.Mock).mockReturnValue({ run: mockRun })
    mockRun.mockResolvedValue({ result: { synced: 5 } })
    mockService = { getOptions: jest.fn().mockReturnValue({ shopId: "shop123" }) }
    mockContainer = {
      resolve: jest.fn().mockImplementation((key: string) => {
        if (key === PRINTIFY_MODULE) return mockService
        throw new Error(`Unknown key: ${key}`)
      }),
    }
  })

  it("resolves shopId from module options and runs sync workflow", async () => {
    const { default: job } = await import("../../../src/jobs/sync-products-job")
    await job(mockContainer as never)
    expect(mockRun).toHaveBeenCalledWith({ input: { shopId: "shop123" } })
  })
})
```

**Step 4: Create `src/jobs/sync-products-job.ts`**

```ts
import { MedusaContainer } from "@medusajs/framework/types"
import { syncProductsWorkflow } from "../workflows/sync-products"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"

export default async function syncProductsJob(container: MedusaContainer) {
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const { shopId } = service.getOptions()

  if (!shopId) {
    console.warn("[printify] sync-products-job: no shopId configured, skipping")
    return
  }

  const { result } = await syncProductsWorkflow(container).run({
    input: { shopId },
  })

  console.log(`[printify] sync-products-job: synced ${result.synced} products`)
}

export const config = {
  name: "printify-sync-products",
  schedule: "0 * * * *", // every hour
}
```

**Step 5: Run all new tests**

```bash
npx jest tests/unit/workflows/sync-products.test.ts tests/unit/jobs/sync-products-job.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/workflows/sync-products.ts src/jobs/sync-products-job.ts tests/unit/workflows/sync-products.test.ts tests/unit/jobs/sync-products-job.test.ts
git commit -m "feat: add syncProductsWorkflow + sync-products-job (hourly cron)"
```

---

## Phase 4 — Order Workflows

### Task 9: Create Printify Order Workflow

**Files:**
- Create: `src/workflows/create-printify-order.ts`
- Create: `tests/unit/workflows/create-printify-order.test.ts`

**Step 1: Write failing test**

```ts
// tests/unit/workflows/create-printify-order.test.ts
import { createPrintifyOrderWorkflow } from "../../../src/workflows/create-printify-order"

describe("createPrintifyOrderWorkflow", () => {
  it("exports a workflow", () => {
    expect(createPrintifyOrderWorkflow).toBeDefined()
  })
})
```

**Step 2: Create `src/workflows/create-printify-order.ts`**

```ts
import {
  createWorkflow,
  createStep,
  WorkflowResponse,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { PrintifyCreateOrderPayload, PrintifyAddress } from "../modules/printify/api-client"

export type CreatePrintifyOrderInput = {
  medusaOrderId: string
  shopId: string
  lineItems: Array<{
    product_id: string
    variant_id: number
    quantity: number
    printify_product_id: string
  }>
  shippingMethod: number
  address: {
    firstName: string
    lastName: string
    email: string
    phone: string
    address1: string
    address2?: string
    city: string
    province: string
    postalCode: string
    countryCode: string
  }
}

type CreatePrintifyOrderOutput = {
  printifyOrderId: string
  localOrderId: string
  status: string
}

const buildOrderPayloadStep = createStep(
  "build-order-payload-step",
  async (input: CreatePrintifyOrderInput) => {
    const address: PrintifyAddress = {
      first_name: input.address.firstName,
      last_name: input.address.lastName,
      email: input.address.email,
      phone: input.address.phone,
      address1: input.address.address1,
      address2: input.address.address2,
      city: input.address.city,
      region: input.address.province,
      zip: input.address.postalCode,
      country: input.address.countryCode.toUpperCase(),
    }

    const payload: PrintifyCreateOrderPayload = {
      external_id: input.medusaOrderId,
      label: `Medusa Order ${input.medusaOrderId}`,
      line_items: input.lineItems.map(item => ({
        product_id: item.printify_product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
      })),
      shipping_method: input.shippingMethod,
      send_shipping_notification: false,
      address_to: address,
    }

    return new StepResponse({ payload, address })
  }
)

const createOrderInPrintifyStep = createStep(
  "create-order-in-printify-step",
  async ({ payload, shopId }: { payload: PrintifyCreateOrderPayload; shopId: string }, { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
    const order = await service.getApiClient().createOrder(shopId, payload)
    return new StepResponse(order, order.id) // compensate data = printify order id
  },
  async (printifyOrderId: string, { container }) => {
    // Compensation: Printify doesn't have a cancel order API at creation stage
    // Log for manual review
    console.warn(`[printify] compensation: order ${printifyOrderId} may need manual cancellation in Printify`)
  }
)

const persistLocalOrderStep = createStep(
  "persist-local-order-step",
  async ({ printifyOrder, input, address }: {
    printifyOrder: Awaited<ReturnType<PrintifyModuleService["getApiClient"]>["createOrder"]>
    input: CreatePrintifyOrderInput
    address: PrintifyAddress
  }, { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)

    // Look up variant costs from product records for immutable cost capture
    const costPerItem: Record<string, number> = {}
    let totalCost = 0

    for (const item of input.lineItems) {
      const products = await service.listPrintifyProducts({ printify_id: item.printify_product_id })
      if (products.length > 0) {
        const product = products[0]
        const variants = (product.variants as Array<{ id: number; cost: number }>) || []
        const variant = variants.find(v => v.id === item.variant_id)
        if (variant) {
          const itemCost = variant.cost * item.quantity
          costPerItem[`${item.printify_product_id}:${item.variant_id}`] = variant.cost
          totalCost += itemCost
        }
      }
    }

    const [created] = await service.createPrintifyOrders([{
      printify_id: printifyOrder.id,
      shop_id: input.shopId,
      medusa_order_id: input.medusaOrderId,
      status: printifyOrder.status || "pending",
      shipping_method: String(input.shippingMethod),
      line_items: input.lineItems,
      address_to: address,
      total_cost: totalCost || null,
      cost_per_item: Object.keys(costPerItem).length > 0 ? costPerItem : null,
      submitted_at: null,
    }])

    return new StepResponse({
      printifyOrderId: printifyOrder.id,
      localOrderId: created.id,
      status: printifyOrder.status,
    })
  }
)

export const createPrintifyOrderWorkflow = createWorkflow(
  "create-printify-order",
  (input: CreatePrintifyOrderInput) => {
    const { payload, address } = buildOrderPayloadStep(input)
    const printifyOrder = createOrderInPrintifyStep({ payload, shopId: input.shopId })
    const result = persistLocalOrderStep({ printifyOrder, input, address })
    return new WorkflowResponse(result)
  }
)
```

**Step 3: Run tests**

```bash
npx jest tests/unit/workflows/create-printify-order.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/workflows/create-printify-order.ts tests/unit/workflows/create-printify-order.test.ts
git commit -m "feat: add createPrintifyOrderWorkflow with immutable cost capture"
```

---

### Task 10: Submit Order Workflow + Auto-Submit Job

**Files:**
- Create: `src/workflows/submit-printify-order.ts`
- Create: `src/jobs/auto-submit-orders-job.ts`
- Create: `tests/unit/workflows/submit-printify-order.test.ts`
- Create: `tests/unit/jobs/auto-submit-orders-job.test.ts`

**Step 1: Create `src/workflows/submit-printify-order.ts`**

```ts
import {
  createWorkflow,
  createStep,
  WorkflowResponse,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"

type SubmitPrintifyOrderInput = {
  localOrderId: string
  shopId: string
}

const submitOrderStep = createStep(
  "submit-order-step",
  async ({ localOrderId, shopId }: SubmitPrintifyOrderInput, { container }) => {
    const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)

    const [localOrder] = await service.listPrintifyOrders({ id: localOrderId })
    if (!localOrder) {
      throw new Error(`PrintifyOrder not found: ${localOrderId}`)
    }
    if (!localOrder.printify_id) {
      throw new Error(`PrintifyOrder ${localOrderId} has no printify_id — cannot submit`)
    }

    const submitted = await service.getApiClient().submitOrder(shopId, localOrder.printify_id as string)

    await service.updatePrintifyOrders(
      { id: localOrderId },
      { status: submitted.status, submitted_at: new Date() }
    )

    return new StepResponse({ status: submitted.status, printifyOrderId: localOrder.printify_id })
  }
)

export const submitPrintifyOrderWorkflow = createWorkflow(
  "submit-printify-order",
  (input: SubmitPrintifyOrderInput) => {
    const result = submitOrderStep(input)
    return new WorkflowResponse(result)
  }
)
```

**Step 2: Create `src/jobs/auto-submit-orders-job.ts`**

```ts
import { MedusaContainer } from "@medusajs/framework/types"
import { PRINTIFY_MODULE } from "../modules/printify"
import PrintifyModuleService from "../modules/printify/service"
import { submitPrintifyOrderWorkflow } from "../workflows/submit-printify-order"

export default async function autoSubmitOrdersJob(container: MedusaContainer) {
  const service: PrintifyModuleService = container.resolve(PRINTIFY_MODULE)
  const { shopId } = service.getOptions()

  if (!shopId) {
    console.warn("[printify] auto-submit-orders-job: no shopId configured, skipping")
    return
  }

  const pendingOrders = await service.listPrintifyOrders({ status: "pending" })

  for (const order of pendingOrders) {
    try {
      await submitPrintifyOrderWorkflow(container).run({
        input: { localOrderId: order.id as string, shopId },
      })
      console.log(`[printify] auto-submit-orders-job: submitted order ${order.id}`)
    } catch (err) {
      console.error(`[printify] auto-submit-orders-job: failed for order ${order.id}:`, err)
    }
  }
}

export const config = {
  name: "printify-auto-submit-orders",
  schedule: "*/5 * * * *", // every 5 minutes
}
```

**Step 3: Write job test**

```ts
// tests/unit/jobs/auto-submit-orders-job.test.ts
import autoSubmitOrdersJob from "../../../src/jobs/auto-submit-orders-job"
import { PRINTIFY_MODULE } from "../../../src/modules/printify"
import { submitPrintifyOrderWorkflow } from "../../../src/workflows/submit-printify-order"

jest.mock("../../../src/workflows/submit-printify-order", () => ({
  __esModule: true,
  submitPrintifyOrderWorkflow: jest.fn(),
}))

const mockRun = jest.fn()

describe("auto-submit-orders-job", () => {
  let mockService: {
    getOptions: jest.Mock
    listPrintifyOrders: jest.Mock
  }
  let mockContainer: { resolve: jest.Mock }

  beforeEach(() => {
    ;(submitPrintifyOrderWorkflow as jest.Mock).mockReturnValue({ run: mockRun })
    mockRun.mockResolvedValue({ result: { status: "in-production" } })
    mockService = {
      getOptions: jest.fn().mockReturnValue({ shopId: "shop1" }),
      listPrintifyOrders: jest.fn().mockResolvedValue([{ id: "local-order-1" }]),
    }
    mockContainer = {
      resolve: jest.fn().mockReturnValue(mockService),
    }
  })

  it("submits all pending orders", async () => {
    await autoSubmitOrdersJob(mockContainer as never)
    expect(mockRun).toHaveBeenCalledWith({
      input: { localOrderId: "local-order-1", shopId: "shop1" },
    })
  })

  it("skips when no shopId configured", async () => {
    mockService.getOptions.mockReturnValue({})
    await autoSubmitOrdersJob(mockContainer as never)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it("continues after a single order fails", async () => {
    mockService.listPrintifyOrders.mockResolvedValue([
      { id: "order-fail" },
      { id: "order-ok" },
    ])
    mockRun
      .mockRejectedValueOnce(new Error("Printify 500"))
      .mockResolvedValueOnce({ result: { status: "in-production" } })

    await autoSubmitOrdersJob(mockContainer as never)
    expect(mockRun).toHaveBeenCalledTimes(2)
  })
})
```

**Step 4: Run all tests**

```bash
npx jest tests/unit/workflows/submit-printify-order.test.ts tests/unit/jobs/auto-submit-orders-job.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/workflows/submit-printify-order.ts src/jobs/auto-submit-orders-job.ts tests/unit/
git commit -m "feat: add submitPrintifyOrderWorkflow + auto-submit-orders-job"
```

---

## Phase 5 — Order Subscriber

### Task 11: Order Placed Subscriber

**Files:**
- Create: `src/subscribers/order-placed.ts`
- Create: `tests/unit/subscribers/order-placed.test.ts`

**Step 1: Write failing test**

```ts
// tests/unit/subscribers/order-placed.test.ts
import orderPlacedHandler, { config } from "../../../src/subscribers/order-placed"
import { createPrintifyOrderWorkflow } from "../../../src/workflows/create-printify-order"
import { PRINTIFY_MODULE } from "../../../src/modules/printify"

jest.mock("../../../src/workflows/create-printify-order", () => ({
  __esModule: true,
  createPrintifyOrderWorkflow: jest.fn(),
}))

const mockRun = jest.fn()

describe("order-placed subscriber", () => {
  let mockService: { getOptions: jest.Mock; listPrintifyProducts: jest.Mock }
  let mockOrderService: { retrieveOrder: jest.Mock }
  let mockContainer: { resolve: jest.Mock }

  beforeEach(() => {
    ;(createPrintifyOrderWorkflow as jest.Mock).mockReturnValue({ run: mockRun })
    mockRun.mockResolvedValue({ result: { localOrderId: "local-1", printifyOrderId: "po-1" } })

    mockService = {
      getOptions: jest.fn().mockReturnValue({ shopId: "shop1" }),
      listPrintifyProducts: jest.fn().mockResolvedValue([
        { printify_id: "pp1", variants: [{ id: 42, cost: 1000 }] }
      ]),
    }
    mockOrderService = {
      retrieveOrder: jest.fn().mockResolvedValue({
        id: "order-1",
        items: [{ product_id: "prod-1", variant_id: "v-1", quantity: 2, metadata: { printify_product_id: "pp1", printify_variant_id: 42 } }],
        shipping_methods: [{ data: { printify_shipping_method: 1 } }],
        shipping_address: {
          first_name: "Jane", last_name: "Doe", email: "j@e.com",
          phone: "555", address_1: "1 Main", city: "SF",
          province: "CA", postal_code: "94105", country_code: "US",
        },
      }),
    }
    mockContainer = {
      resolve: jest.fn().mockImplementation((key: string) => {
        if (key === PRINTIFY_MODULE) return mockService
        if (key === "order") return mockOrderService
        throw new Error(`Unknown: ${key}`)
      }),
    }
  })

  it("subscribes to order.placed event", () => {
    expect(config.event).toBe("order.placed")
  })

  it("calls createPrintifyOrderWorkflow when order has Printify items", async () => {
    await orderPlacedHandler({ event: { data: { id: "order-1" } }, container: mockContainer as never })
    expect(mockRun).toHaveBeenCalled()
  })

  it("skips if no shopId configured", async () => {
    mockService.getOptions.mockReturnValue({})
    await orderPlacedHandler({ event: { data: { id: "order-1" } }, container: mockContainer as never })
    expect(mockRun).not.toHaveBeenCalled()
  })
})
```

**Step 2: Run to verify failure**

```bash
npx jest tests/unit/subscribers/order-placed.test.ts
```

**Step 3: Create `src/subscribers/order-placed.ts`**

```ts
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

  // Filter to only items that have Printify metadata
  const printifyItems = order.items.filter(
    (item: Record<string, unknown>) =>
      (item.metadata as Record<string, unknown>)?.printify_product_id
  )

  if (printifyItems.length === 0) {
    return
  }

  const shippingMethod =
    order.shipping_methods?.[0]?.data?.printify_shipping_method ?? 1

  await createPrintifyOrderWorkflow(container).run({
    input: {
      medusaOrderId: order.id,
      shopId,
      lineItems: printifyItems.map((item: Record<string, unknown>) => ({
        product_id: (item.metadata as Record<string, unknown>).printify_product_id as string,
        variant_id: Number((item.metadata as Record<string, unknown>).printify_variant_id),
        quantity: item.quantity as number,
        printify_product_id: (item.metadata as Record<string, unknown>).printify_product_id as string,
      })),
      shippingMethod: Number(shippingMethod),
      address: {
        firstName: order.shipping_address.first_name,
        lastName: order.shipping_address.last_name,
        email: order.shipping_address.email || order.email,
        phone: order.shipping_address.phone,
        address1: order.shipping_address.address_1,
        address2: order.shipping_address.address_2,
        city: order.shipping_address.city,
        province: order.shipping_address.province,
        postalCode: order.shipping_address.postal_code,
        countryCode: order.shipping_address.country_code,
      },
    },
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
```

**Step 4: Run tests**

```bash
npx jest tests/unit/subscribers/order-placed.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/subscribers/order-placed.ts tests/unit/subscribers/order-placed.test.ts
git commit -m "feat: add order-placed subscriber that auto-creates Printify order"
```

---

## Phase 6 — Webhooks

### Task 12: Webhook Route

**Files:**
- Create: `src/api/webhooks/printify/route.ts`
- Create: `src/lib/webhook-utils.ts`
- Create: `tests/unit/api/webhooks/printify.test.ts`

**Step 1: Create `src/lib/webhook-utils.ts`**

```ts
import { createHmac, timingSafeEqual } from "crypto"

export function verifyPrintifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")

  // Guard against RangeError from timingSafeEqual on mismatched buffer sizes
  if (signature.length !== expected.length) {
    return false
  }

  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  )
}
```

**Step 2: Write failing webhook route tests**

```ts
// tests/unit/api/webhooks/printify.test.ts
import { verifyPrintifySignature } from "../../../src/lib/webhook-utils"
import { createHmac } from "crypto"

describe("verifyPrintifySignature", () => {
  const secret = "my-webhook-secret"

  const makeSignature = (body: string) =>
    createHmac("sha256", secret).update(body).digest("hex")

  it("returns true for a valid signature", () => {
    const body = JSON.stringify({ topic: "order:shipped" })
    const sig = makeSignature(body)
    expect(verifyPrintifySignature(body, sig, secret)).toBe(true)
  })

  it("returns false for an invalid signature", () => {
    const body = JSON.stringify({ topic: "order:shipped" })
    const sig = makeSignature(body)
    const tampered = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a")
    expect(verifyPrintifySignature(body, tampered, secret)).toBe(false)
  })

  it("returns false for mismatched-length signature without throwing RangeError", () => {
    const body = JSON.stringify({ topic: "order:shipped" })
    expect(verifyPrintifySignature(body, "short", secret)).toBe(false)
  })
})
```

**Step 3: Run to verify failure**

```bash
npx jest tests/unit/api/webhooks/printify.test.ts
```

**Step 4: Run tests (after `webhook-utils.ts` is in place)**

```bash
npx jest tests/unit/api/webhooks/printify.test.ts
```

Expected: PASS

**Step 5: Create `src/api/webhooks/printify/route.ts`**

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRINTIFY_MODULE } from "../../../modules/printify"
import PrintifyModuleService from "../../../modules/printify/service"
import { verifyPrintifySignature } from "../../../lib/webhook-utils"

type PrintifyWebhookBody = {
  type: string
  shop_id: string
  resource: {
    id: string
    type: string
    data?: Record<string, unknown>
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const { webhookSecret } = service.getOptions()

  const signature = req.headers["x-pfy-signature"] as string
  const rawBody = JSON.stringify(req.body)

  if (!verifyPrintifySignature(rawBody, signature ?? "", webhookSecret)) {
    return res.status(401).json({ error: "Invalid signature" })
  }

  const body = req.body as PrintifyWebhookBody

  try {
    switch (body.type) {
      case "order:status-changed":
      case "order:sent-to-production":
      case "order:shipped":
      case "order:shipment:delivered":
        await handleOrderEvent(body, service)
        break

      case "product:updated":
      case "product:deleted":
        await handleProductEvent(body, service)
        break

      case "shop:disconnected":
        await handleShopDisconnected(body, service)
        break

      default:
        console.warn(`[printify] webhook: unhandled event type: ${body.type}`)
    }

    res.sendStatus(200)
  } catch (err) {
    console.error("[printify] webhook handler error:", err)
    res.status(500).json({ error: "Internal error" })
  }
}

async function handleOrderEvent(body: PrintifyWebhookBody, service: PrintifyModuleService) {
  const printifyOrderId = body.resource.id
  const status = (body.resource.data?.status as string) ?? body.type.split(":").pop() ?? "unknown"

  const orders = await service.listPrintifyOrders({ printify_id: printifyOrderId })
  if (orders.length > 0) {
    await service.updatePrintifyOrders({ printify_id: printifyOrderId }, { status })
  }
}

async function handleProductEvent(body: PrintifyWebhookBody, service: PrintifyModuleService) {
  if (body.type === "product:deleted") {
    await service.updatePrintifyProducts(
      { printify_id: body.resource.id },
      { is_published: false }
    )
  }
  // product:updated — trigger a re-sync (or just log for now)
  console.log(`[printify] webhook: product updated: ${body.resource.id}`)
}

async function handleShopDisconnected(body: PrintifyWebhookBody, service: PrintifyModuleService) {
  console.warn(`[printify] webhook: shop disconnected: ${body.shop_id}`)
  await service.updatePrintifyShops({ printify_id: body.shop_id }, { sales_channel_id: null })
}
```

**Step 6: Commit**

```bash
git add src/api/webhooks/ src/lib/webhook-utils.ts tests/unit/api/webhooks/
git commit -m "feat: add Printify webhook route with HMAC signature verification"
```

---

## Phase 7 — Module Links

### Task 13: Module Links

**Files:**
- Create: `src/links/printify-product-medusa-product.ts`
- Create: `src/links/printify-order-medusa-order.ts`

> Links don't have unit tests — they're verified by integration tests or runtime.

**Step 1: Create `src/links/printify-product-medusa-product.ts`**

```ts
import { defineLink } from "@medusajs/framework/utils"
import PrintifyModule from "../modules/printify"
import ProductModule from "@medusajs/medusa/product"

export default defineLink(
  {
    linkable: PrintifyModule.linkable.printifyProduct,
    field: "id",
  },
  {
    linkable: ProductModule.linkable.product,
    field: "id",
  }
)
```

**Step 2: Create `src/links/printify-order-medusa-order.ts`**

```ts
import { defineLink } from "@medusajs/framework/utils"
import PrintifyModule from "../modules/printify"
import OrderModule from "@medusajs/medusa/order"

export default defineLink(
  {
    linkable: PrintifyModule.linkable.printifyOrder,
    field: "id",
  },
  {
    linkable: OrderModule.linkable.order,
    field: "id",
  }
)
```

**Step 3: Commit**

```bash
git add src/links/
git commit -m "feat: add module links connecting Printify entities to Medusa Product/Order"
```

---

## Phase 8 — Admin API Routes

### Task 14: Admin API — Shops + Products

**Files:**
- Create: `src/api/admin/printify/shops/route.ts`
- Create: `src/api/admin/printify/products/route.ts`
- Create: `tests/unit/api/admin/printify-routes.test.ts`

**Step 1: Create `src/api/admin/printify/shops/route.ts`**

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import PrintifyModuleService from "../../../../modules/printify/service"

// GET /admin/printify/shops — list all synced shops
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const shops = await service.listPrintifyShops()
  res.json({ shops })
}

// POST /admin/printify/shops/sync — trigger shop sync from Printify API
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { syncShopsWorkflow } = await import("../../../../workflows/sync-shops")
  const { result } = await syncShopsWorkflow(req.scope).run({ input: {} })
  res.json(result)
}
```

**Step 2: Create `src/api/admin/printify/products/route.ts`**

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import PrintifyModuleService from "../../../../modules/printify/service"

// GET /admin/printify/products
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const { shop_id, is_published, limit = "50", offset = "0" } = req.query as Record<string, string>

  const filters: Record<string, unknown> = {}
  if (shop_id) filters.shop_id = shop_id
  if (is_published !== undefined) filters.is_published = is_published === "true"

  const products = await service.listPrintifyProducts(filters)
  const paginated = products.slice(Number(offset), Number(offset) + Number(limit))

  res.json({ products: paginated, count: products.length, offset: Number(offset), limit: Number(limit) })
}

// POST /admin/printify/products/sync — trigger product sync
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const { shopId } = service.getOptions()

  if (!shopId) {
    return res.status(400).json({ error: "No shopId configured in plugin options" })
  }

  const { syncProductsWorkflow } = await import("../../../../workflows/sync-products")
  const { result } = await syncProductsWorkflow(req.scope).run({ input: { shopId } })
  res.json(result)
}
```

**Step 3: Create `src/api/admin/printify/orders/route.ts`**

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import PrintifyModuleService from "../../../../modules/printify/service"

// GET /admin/printify/orders
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const { status, limit = "50", offset = "0" } = req.query as Record<string, string>

  const filters: Record<string, unknown> = {}
  if (status) filters.status = status

  const orders = await service.listPrintifyOrders(filters)
  const paginated = orders.slice(Number(offset), Number(offset) + Number(limit))

  res.json({ orders: paginated, count: orders.length })
}
```

**Step 4: Create `src/api/admin/printify/orders/[id]/submit/route.ts`**

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRINTIFY_MODULE } from "../../../../../../modules/printify"
import PrintifyModuleService from "../../../../../../modules/printify/service"
import { submitPrintifyOrderWorkflow } from "../../../../../../workflows/submit-printify-order"

// POST /admin/printify/orders/:id/submit — manually submit a pending order
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const service: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)
  const { shopId } = service.getOptions()

  if (!shopId) {
    return res.status(400).json({ error: "No shopId configured" })
  }

  const { result } = await submitPrintifyOrderWorkflow(req.scope).run({
    input: { localOrderId: id, shopId },
  })

  res.json(result)
}
```

**Step 5: Commit**

```bash
git add src/api/admin/printify/
git commit -m "feat: add admin API routes for shops, products, and orders"
```

---

## Phase 9 — Workflows Index

### Task 15: Export Workflows

**Files:**
- Create: `src/workflows/index.ts`

**Step 1: Create `src/workflows/index.ts`**

```ts
export { syncShopsWorkflow } from "./sync-shops"
export { syncProductsWorkflow } from "./sync-products"
export { createPrintifyOrderWorkflow } from "./create-printify-order"
export { submitPrintifyOrderWorkflow } from "./submit-printify-order"
```

**Step 2: Commit**

```bash
git add src/workflows/index.ts
git commit -m "chore: export all workflows from workflows/index.ts"
```

---

## Phase 10 — Database Migrations

### Task 16: Generate and Verify Migrations

**Step 1: Add DB env vars to `.env`**

```bash
cat > .env << 'EOF'
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=medusa_printify_plugin
EOF
```

**Step 2: Generate migrations**

```bash
npx medusa plugin:db:generate
```

Expected: migration files created in `src/modules/printify/migrations/`

**Step 3: Verify migration files exist**

```bash
ls src/modules/printify/migrations/
```

Expected: one or more `Migration*.ts` files

**Step 4: Commit**

```bash
git add src/modules/printify/migrations/
git commit -m "chore: generate DB migrations for Printify module"
```

---

## Phase 11 — Admin UI

### Task 17: Printify Admin Page

**Files:**
- Create: `src/admin/routes/printify/page.tsx`

> Admin UI uses React + @medusajs/ui. No unit tests for React components — test with Playwright against a running dev server if needed.

**Step 1: Create `src/admin/routes/printify/page.tsx`**

```tsx
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Button, Table, Badge } from "@medusajs/ui"
import { useEffect, useState } from "react"

type PrintifyShop = { id: string; printify_id: string; title: string }

const PrintifyPage = () => {
  const [shops, setShops] = useState<PrintifyShop[]>([])
  const [syncing, setSyncing] = useState(false)

  const loadShops = async () => {
    const res = await fetch("/admin/printify/shops", { credentials: "include" })
    const json = await res.json()
    setShops(json.shops ?? [])
  }

  const syncShops = async () => {
    setSyncing(true)
    await fetch("/admin/printify/shops", { method: "POST", credentials: "include" })
    await loadShops()
    setSyncing(false)
  }

  useEffect(() => { loadShops() }, [])

  return (
    <Container className="p-8">
      <div className="flex justify-between items-center mb-6">
        <Heading>Printify Integration</Heading>
        <Button onClick={syncShops} isLoading={syncing} size="small">
          Sync Shops
        </Button>
      </div>

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Shop Name</Table.HeaderCell>
            <Table.HeaderCell>Printify ID</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {shops.map(shop => (
            <Table.Row key={shop.id}>
              <Table.Cell>{shop.title}</Table.Cell>
              <Table.Cell>
                <Badge color="grey" size="2xsmall">{shop.printify_id}</Badge>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Printify",
  icon: () => null, // Replace with a Printify icon SVG if desired
})

export default PrintifyPage
```

**Step 2: Commit**

```bash
git add src/admin/routes/printify/
git commit -m "feat: add Printify admin page showing synced shops"
```

---

### Task 18: Order Detail Widget

**Files:**
- Create: `src/admin/widgets/printify-order-widget.tsx`

**Step 1: Create `src/admin/widgets/printify-order-widget.tsx`**

```tsx
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Badge, Button } from "@medusajs/ui"
import { useEffect, useState } from "react"

type PrintifyOrder = {
  id: string
  printify_id: string | null
  status: string
  total_cost: number | null
  submitted_at: string | null
}

type WidgetProps = {
  data: { id: string }
}

const PrintifyOrderWidget = ({ data }: WidgetProps) => {
  const [printifyOrders, setPrintifyOrders] = useState<PrintifyOrder[]>([])
  const [submitting, setSubmitting] = useState(false)

  const loadOrders = async () => {
    const res = await fetch(
      `/admin/printify/orders?medusa_order_id=${data.id}`,
      { credentials: "include" }
    )
    const json = await res.json()
    setPrintifyOrders(json.orders ?? [])
  }

  const submitOrder = async (orderId: string) => {
    setSubmitting(true)
    await fetch(`/admin/printify/orders/${orderId}/submit`, {
      method: "POST",
      credentials: "include",
    })
    await loadOrders()
    setSubmitting(false)
  }

  useEffect(() => { loadOrders() }, [data.id])

  if (printifyOrders.length === 0) return null

  return (
    <Container className="p-4">
      <Heading className="mb-3" level="h2">Printify Fulfillment</Heading>
      {printifyOrders.map(order => (
        <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
          <div>
            <Text size="small" className="font-medium">
              {order.printify_id ?? "Not yet submitted"}
            </Text>
            <Badge
              color={
                order.status === "shipped" ? "green"
                : order.status === "in-production" ? "blue"
                : order.status === "pending" ? "orange"
                : "grey"
              }
              size="2xsmall"
              className="mt-1"
            >
              {order.status}
            </Badge>
          </div>
          {order.status === "pending" && (
            <Button
              size="small"
              variant="secondary"
              onClick={() => submitOrder(order.id)}
              isLoading={submitting}
            >
              Submit to Printify
            </Button>
          )}
          {order.total_cost && (
            <Text size="small" className="text-ui-fg-muted">
              Cost: ${(order.total_cost / 100).toFixed(2)}
            </Text>
          )}
        </div>
      ))}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default PrintifyOrderWidget
```

**Step 2: Commit**

```bash
git add src/admin/widgets/printify-order-widget.tsx
git commit -m "feat: add Printify order status widget on order details page"
```

---

### Task 19: Products Admin Page

**Files:**
- Create: `src/admin/routes/printify/products/page.tsx`

**Step 1: Create `src/admin/routes/printify/products/page.tsx`**

```tsx
import { Container, Heading, Button, Table, Badge, Input } from "@medusajs/ui"
import { useState, useEffect } from "react"

type PrintifyProduct = {
  id: string
  printify_id: string
  title: string
  is_published: boolean
  variants: { id: number; title: string; cost: number }[]
}

const PrintifyProductsPage = () => {
  const [products, setProducts] = useState<PrintifyProduct[]>([])
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState("")

  const loadProducts = async () => {
    const res = await fetch("/admin/printify/products", { credentials: "include" })
    const json = await res.json()
    setProducts(json.products ?? [])
  }

  const syncProducts = async () => {
    setSyncing(true)
    await fetch("/admin/printify/products", { method: "POST", credentials: "include" })
    await loadProducts()
    setSyncing(false)
  }

  useEffect(() => { loadProducts() }, [])

  const filtered = products.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Container className="p-8">
      <div className="flex justify-between items-center mb-6">
        <Heading>Printify Products</Heading>
        <Button onClick={syncProducts} isLoading={syncing} size="small">
          Sync Products
        </Button>
      </div>

      <Input
        placeholder="Search products..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="mb-4 max-w-xs"
      />

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Title</Table.HeaderCell>
            <Table.HeaderCell>Variants</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {filtered.map(product => (
            <Table.Row key={product.id}>
              <Table.Cell>{product.title}</Table.Cell>
              <Table.Cell>{product.variants?.length ?? 0} variants</Table.Cell>
              <Table.Cell>
                <Badge color={product.is_published ? "green" : "grey"} size="2xsmall">
                  {product.is_published ? "Published" : "Draft"}
                </Badge>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

export default PrintifyProductsPage
```

**Step 2: Commit**

```bash
git add src/admin/routes/printify/products/
git commit -m "feat: add Printify products admin page with sync and search"
```

---

## Phase 12 — Register Webhook on Startup

### Task 20: Auto-Register Printify Webhooks

**Files:**
- Create: `src/subscribers/plugin-registered.ts`

Printify requires webhooks to be registered per shop. This subscriber fires once on startup.

**Step 1: Create `src/subscribers/plugin-registered.ts`**

```ts
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
  const { shopId, webhookBaseUrl } = service.getOptions() as { shopId?: string; webhookBaseUrl?: string }

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
```

**Step 2: Add `webhookBaseUrl` to `PrintifyModuleOptions`**

In `src/modules/printify/types.ts`, add the new field:

```ts
export type PrintifyModuleOptions = {
  apiKey: string
  webhookSecret: string
  shopId?: string
  webhookBaseUrl?: string
  enableNotifications?: boolean
  notificationEmail?: string
}
```

**Step 3: Commit**

```bash
git add src/subscribers/plugin-registered.ts src/modules/printify/types.ts
git commit -m "feat: auto-register Printify webhooks on app start"
```

---

## Phase 13 — Run Full Test Suite + Build

### Task 21: Final Test Run

**Step 1: Run all tests**

```bash
npx jest --coverage
```

Expected: all tests pass. Review coverage report for gaps.

**Step 2: Fix any TypeScript errors**

```bash
npx tsc --noEmit
```

Fix any type errors before proceeding.

**Step 3: Build the plugin**

```bash
npm run build
```

Expected: output in `.medusa/server/`

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final build and all tests passing"
```

---

## Plugin Options Reference

When registering the plugin in a Medusa application's `medusa-config.ts`:

```ts
plugins: [
  {
    resolve: "medusa-plugin-printify",
    options: {
      apiKey: process.env.PRINTIFY_API_KEY,          // required
      webhookSecret: process.env.PRINTIFY_WEBHOOK_SECRET, // required
      shopId: process.env.PRINTIFY_SHOP_ID,          // optional (required for jobs/sync)
      webhookBaseUrl: process.env.WEBHOOK_BASE_URL,  // optional (e.g. https://mystore.com)
    },
  },
]
```

---

## Summary of Files Created

| Phase | Files |
|---|---|
| 1 | `jest.config.ts`, `jest.setup.ts`, `src/modules/printify/api-client.ts` |
| 2 | `src/modules/printify/models/*.ts`, `src/modules/printify/service.ts`, `src/modules/printify/types.ts`, `src/modules/printify/index.ts` |
| 3 | `src/workflows/sync-shops.ts`, `src/workflows/sync-products.ts`, `src/jobs/sync-products-job.ts` |
| 4 | `src/workflows/create-printify-order.ts`, `src/workflows/submit-printify-order.ts`, `src/jobs/auto-submit-orders-job.ts` |
| 5 | `src/subscribers/order-placed.ts` |
| 6 | `src/api/webhooks/printify/route.ts`, `src/lib/webhook-utils.ts` |
| 7 | `src/links/printify-product-medusa-product.ts`, `src/links/printify-order-medusa-order.ts` |
| 8 | `src/api/admin/printify/shops/route.ts`, `src/api/admin/printify/products/route.ts`, `src/api/admin/printify/orders/route.ts`, `src/api/admin/printify/orders/[id]/submit/route.ts` |
| 9 | `src/workflows/index.ts` |
| 10 | DB migrations (auto-generated) |
| 11 | `src/admin/routes/printify/page.tsx`, `src/admin/routes/printify/products/page.tsx`, `src/admin/widgets/printify-order-widget.tsx` |
| 12 | `src/subscribers/plugin-registered.ts` |
