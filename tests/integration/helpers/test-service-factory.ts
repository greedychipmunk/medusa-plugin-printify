import { PrintifyModuleService } from "../../../src/modules/printify/service"
import { PrintifyModuleOptions } from "../../../src/modules/printify/types"

type AnyRecord = Record<string, unknown>

function createInMemoryStore() {
  const stores: Record<string, AnyRecord[]> = {
    printify_shop: [],
    printify_product: [],
    printify_order: [],
  }

  const makeId = () => Math.random().toString(36).slice(2, 10)

  function list(table: string, filters: AnyRecord = {}): AnyRecord[] {
    return stores[table].filter((item) =>
      Object.entries(filters).every(([k, v]) => item[k] === v)
    )
  }

  function create(table: string, data: AnyRecord | AnyRecord[]): AnyRecord | AnyRecord[] {
    const items = Array.isArray(data) ? data : [data]
    const created = items.map((d) => ({ id: makeId(), ...d }))
    stores[table].push(...created)
    return Array.isArray(data) ? created : created[0]
  }

  function update(table: string, selector: AnyRecord, data: AnyRecord): void {
    stores[table] = stores[table].map((item) =>
      Object.entries(selector).every(([k, v]) => item[k] === v)
        ? { ...item, ...data }
        : item
    )
  }

  function remove(table: string, selector: AnyRecord): void {
    stores[table] = stores[table].filter(
      (item) => !Object.entries(selector).every(([k, v]) => item[k] === v)
    )
  }

  return { stores, list, create, update, remove }
}

export function createTestService(options: Partial<PrintifyModuleOptions> = {}) {
  const store = createInMemoryStore()

  const defaultOptions: PrintifyModuleOptions = {
    apiKey: "test-api-key",
    webhookSecret: "test-secret",
    ...options,
  }

  // Mock MedusaService base to inject in-memory store operations
  jest.mock("@medusajs/framework/utils", () => {
    const actual = jest.requireActual("@medusajs/framework/utils")
    return {
      ...actual,
      MedusaService: jest.fn(() =>
        class MockBase {
          listPrintifyShops = jest.fn((f?: AnyRecord) => Promise.resolve(store.list("printify_shop", f)))
          createPrintifyShops = jest.fn((d: AnyRecord[]) => Promise.resolve(store.create("printify_shop", d)))
          updatePrintifyShops = jest.fn((sel: AnyRecord, d: AnyRecord) => Promise.resolve(store.update("printify_shop", sel, d)))
          listPrintifyProducts = jest.fn((f?: AnyRecord) => Promise.resolve(store.list("printify_product", f)))
          createPrintifyProducts = jest.fn((d: AnyRecord[]) => Promise.resolve(store.create("printify_product", d)))
          updatePrintifyProducts = jest.fn((sel: AnyRecord, d: AnyRecord) => Promise.resolve(store.update("printify_product", sel, d)))
          listPrintifyOrders = jest.fn((f?: AnyRecord) => Promise.resolve(store.list("printify_order", f)))
          createPrintifyOrders = jest.fn((d: AnyRecord[]) => Promise.resolve(store.create("printify_order", d)))
          updatePrintifyOrders = jest.fn((sel: AnyRecord, d: AnyRecord) => Promise.resolve(store.update("printify_order", sel, d)))
        }
      ),
    }
  })

  const service = new PrintifyModuleService({} as never, { options: defaultOptions })
  return { service, store: store.stores, options: defaultOptions }
}
