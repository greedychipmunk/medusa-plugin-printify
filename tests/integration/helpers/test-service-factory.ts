/**
 * Integration Test Service Factory
 *
 * Creates a PrintifyModuleService with in-memory CRUD stores,
 * mocking only the MedusaService base class and DI container.
 * All business logic, bridges, error handling, and data transforms run for real.
 */

// Must be called before any import that touches @medusajs/framework/utils
jest.mock("@medusajs/framework/utils", () => {
  const modelChain = {
    primaryKey: () => modelChain,
    unique: () => modelChain,
    nullable: () => modelChain,
    default: () => modelChain,
  }
  return {
    MedusaService: () =>
      class MockMedusaServiceBase {
        constructor() {
          // Container is injected by Medusa runtime; we attach it manually in factory
        }
      },
    Modules: { PRODUCT: "productService", ORDER: "orderService" },
    ContainerRegistrationKeys: { QUERY: "query" },
    model: {
      define: jest.fn().mockReturnValue({}),
      id: () => modelChain,
      text: () => modelChain,
      number: () => modelChain,
      boolean: () => modelChain,
      json: () => modelChain,
      dateTime: () => modelChain,
    },
    Module: jest.fn(),
    defineConfig: jest.fn(),
  }
})

import PrintifyModuleService from "../../../src/modules/printify/service"

// ── In-memory store helpers ────────────────────────────────────────

interface Entity {
  id: string
  [key: string]: any
}

function createInMemoryStore() {
  const store = new Map<string, Entity>()
  let idCounter = 1

  return {
    store,

    create(items: Record<string, any>[]): Entity[] {
      return items.map((item) => {
        const id = item.id || `test_${idCounter++}`
        const entity = {
          ...item,
          id,
          created_at: item.created_at || new Date(),
          updated_at: item.updated_at || new Date(),
        }
        store.set(id, entity)
        return { ...entity }
      })
    },

    retrieve(id: string): Entity {
      const entity = store.get(id)
      if (!entity) {
        throw new Error(`Entity not found: ${id}`)
      }
      return { ...entity }
    },

    list(opts: { filters?: Record<string, any> } = {}): Entity[] {
      const filters = opts.filters || {}
      let results = Array.from(store.values())

      for (const [key, value] of Object.entries(filters)) {
        results = results.filter((entity) => {
          if (Array.isArray(value)) {
            return value.includes(entity[key])
          }
          return entity[key] === value
        })
      }

      return results.map((e) => ({ ...e }))
    },

    listAndCount(
      opts: {
        filters?: Record<string, any>
        skip?: number
        take?: number
        order?: Record<string, string>
      } = {},
    ): [Entity[], number] {
      let results = this.list({ filters: opts.filters })
      const total = results.length

      // Sort
      if (opts.order) {
        const [[field, dir]] = Object.entries(opts.order)
        results.sort((a, b) => {
          if (a[field] < b[field]) return dir === "asc" ? -1 : 1
          if (a[field] > b[field]) return dir === "asc" ? 1 : -1
          return 0
        })
      }

      // Paginate
      const skip = opts.skip || 0
      const take = opts.take ?? results.length
      results = results.slice(skip, skip + take)

      return [results, total]
    },

    update(updates: Array<{ id: string; [key: string]: any }>): Entity[] {
      return updates.map((upd) => {
        const existing = store.get(upd.id)
        if (!existing) {
          throw new Error(`Entity not found for update: ${upd.id}`)
        }
        const merged = { ...existing, ...upd, updated_at: new Date() }
        store.set(upd.id, merged)
        return { ...merged }
      })
    },

    delete(ids: string[]): void {
      for (const id of ids) {
        store.delete(id)
      }
    },
  }
}

// ── Factory ────────────────────────────────────────────────────────

export interface TestServiceContext {
  service: PrintifyModuleService
  stores: {
    configurations: ReturnType<typeof createInMemoryStore>
    products: ReturnType<typeof createInMemoryStore>
    orders: ReturnType<typeof createInMemoryStore>
  }
  mockContainer: {
    link: { create: jest.Mock; dismiss: jest.Mock }
    productService: {
      createProducts: jest.Mock
      retrieveProduct: jest.Mock
      deleteProducts: jest.Mock
    }
    query: { graph: jest.Mock }
    logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock }
  }
}

export function createTestService(): TestServiceContext {
  const configurations = createInMemoryStore()
  const products = createInMemoryStore()
  const orders = createInMemoryStore()

  const storesObj = { configurations, products, orders }

  const mockContainer = {
    link: { create: jest.fn(), dismiss: jest.fn() },
    productService: {
      createProducts: jest.fn().mockImplementation((items: any[]) =>
        items.map((item, i) => ({
          id: `medusa_prod_${Date.now()}_${i}`,
          ...item,
        })),
      ),
      retrieveProduct: jest.fn().mockImplementation((id: string) => ({
        id,
        metadata: { printify_auto_created: true },
      })),
      deleteProducts: jest.fn(),
    },
    query: { graph: jest.fn().mockResolvedValue({ data: [] }) },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  }

  // Construct service (base class is mocked to empty)
  const service = new PrintifyModuleService()

  // Wire CRUD methods to in-memory stores
  // Configurations
  ;(service as any).createPrintifyConfigurations = (items: any[]) =>
    configurations.create(items)
  ;(service as any).retrievePrintifyConfiguration = (id: string) =>
    configurations.retrieve(id)
  ;(service as any).listPrintifyConfigurations = (opts: any) =>
    configurations.list(opts)
  ;(service as any).listAndCountPrintifyConfigurations = (opts: any) =>
    configurations.listAndCount(opts)
  ;(service as any).updatePrintifyConfigurations = (updates: any[]) =>
    configurations.update(updates)
  ;(service as any).deletePrintifyConfigurations = (ids: string[]) =>
    configurations.delete(ids)

  // Products
  ;(service as any).createPrintifyProducts = (items: any[]) =>
    products.create(items)
  ;(service as any).retrievePrintifyProduct = (id: string) =>
    products.retrieve(id)
  ;(service as any).listPrintifyProducts = (opts: any) =>
    products.list(opts)
  ;(service as any).listAndCountPrintifyProducts = (opts: any) =>
    products.listAndCount(opts)
  ;(service as any).updatePrintifyProducts = (updates: any[]) =>
    products.update(updates)
  ;(service as any).deletePrintifyProducts = (ids: string[]) =>
    products.delete(ids)

  // Orders
  ;(service as any).createPrintifyOrders = (items: any[]) =>
    orders.create(items)
  ;(service as any).retrievePrintifyOrder = (id: string) =>
    orders.retrieve(id)
  ;(service as any).listPrintifyOrders = (opts: any) =>
    orders.list(opts)
  ;(service as any).listAndCountPrintifyOrders = (opts: any) =>
    orders.listAndCount(opts)
  ;(service as any).updatePrintifyOrders = (updates: any[]) =>
    orders.update(updates)
  ;(service as any).deletePrintifyOrders = (ids: string[]) =>
    orders.delete(ids)

  // Wire container (service accesses it via this.__container__)
  const containerResolveMap: Record<string, any> = {
    link: mockContainer.link,
    productService: mockContainer.productService,
    query: mockContainer.query,
  }
  ;(service as any).__container__ = {
    resolve: (key: string) => {
      if (containerResolveMap[key]) return containerResolveMap[key]
      throw new Error(`Unknown container key: ${key}`)
    },
  }

  return { service, stores: storesObj, mockContainer }
}
