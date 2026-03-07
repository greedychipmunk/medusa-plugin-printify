import { PrintifyApiClient } from "../../../src/modules/printify/api-client"
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

  return { stores, list, create, update }
}

export function createTestService(options: Partial<PrintifyModuleOptions> = {}) {
  const store = createInMemoryStore()

  const defaultOptions: PrintifyModuleOptions = {
    apiKey: "test-api-key",
    webhookSecret: "test-secret",
    ...options,
  }

  // Bypass the MedusaService constructor by creating an instance directly from
  // the prototype. This lets us inject in-memory store methods while keeping
  // all real business logic (getApiClient, getOptions, etc.) from the prototype.
  const service = Object.create(PrintifyModuleService.prototype) as PrintifyModuleService

  // Use unknown cast first to satisfy TypeScript when assigning private fields
  // and read-only generated methods via index access on the raw object.
  const svc = service as unknown as AnyRecord

  // Set private fields that the constructor normally assigns
  svc["options"] = defaultOptions
  svc["apiClient"] = new PrintifyApiClient(defaultOptions.apiKey)

  // Inject in-memory CRUD methods (replacing what MedusaService would generate)
  svc["listPrintifyShops"] = jest.fn((f?: AnyRecord) =>
    Promise.resolve(store.list("printify_shop", f ?? {}))
  )
  svc["createPrintifyShops"] = jest.fn((d: AnyRecord[]) =>
    Promise.resolve(store.create("printify_shop", d))
  )
  svc["updatePrintifyShops"] = jest.fn((sel: AnyRecord, d: AnyRecord) => {
    store.update("printify_shop", sel, d)
    return Promise.resolve()
  })
  svc["listPrintifyProducts"] = jest.fn((f?: AnyRecord) =>
    Promise.resolve(store.list("printify_product", f ?? {}))
  )
  svc["createPrintifyProducts"] = jest.fn((d: AnyRecord[]) =>
    Promise.resolve(store.create("printify_product", d))
  )
  svc["updatePrintifyProducts"] = jest.fn((sel: AnyRecord, d: AnyRecord) => {
    store.update("printify_product", sel, d)
    return Promise.resolve()
  })
  svc["listPrintifyOrders"] = jest.fn((f?: AnyRecord) =>
    Promise.resolve(store.list("printify_order", f ?? {}))
  )
  svc["createPrintifyOrders"] = jest.fn((d: AnyRecord[]) =>
    Promise.resolve(store.create("printify_order", d))
  )
  svc["updatePrintifyOrders"] = jest.fn((sel: AnyRecord, d: AnyRecord) => {
    store.update("printify_order", sel, d)
    return Promise.resolve()
  })

  return { service, store: store.stores, options: defaultOptions }
}
