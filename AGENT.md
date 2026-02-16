# AGENT.md - MedusaJS Printify Plugin

## Project Goal

Build a MedusaJS v2.11+ plugin that integrates with the Printify API for print-on-demand product management and order fulfillment. The plugin provides a dedicated admin page where merchants can manage Printify products, orders, and configuration directly within the MedusaJS admin dashboard.

## Current State

The plugin has a working foundation with DML models, service stubs, API routes, and admin widgets. However, many service methods contain placeholder implementations (`// In a real implementation, this would...`). The admin UI is currently implemented as widgets injected into existing MedusaJS pages rather than as dedicated admin pages.

### What Exists
- DML models for configuration, products, orders, variants, and cart items
- API routes for admin and storefront endpoints
- Printify API client with basic product, order, and shop endpoints
- Admin widgets for configuration and product management (widget-based, not page-based)
- 82 passing tests across 5 test suites
- TypeScript compilation with modern MedusaJS imports

### What Needs Work
- Service layer methods are stubs that return empty/null values instead of querying the database
- No MikroORM repository integration for actual CRUD operations
- Admin UI is widget-based; needs dedicated admin pages at `/a/printify/*`
- Missing Printify API coverage: catalog/blueprint browsing, image uploads, webhook management, shipping calculations
- No workflow implementations for long-running operations (sync, order submission)
- No scheduled job for automatic product sync

## Printify API Reference

**Base URL**: `https://api.printify.com/v1/`
**Auth**: Bearer token via `Authorization: Bearer {api_key}`
**Global Rate Limit**: 600 req/min
**Catalog Rate Limit**: 100 req/min
**Publishing Rate Limit**: 200 req/30min

### Shops
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/shops.json` | List all shops |
| DELETE | `/v1/shops/{shop_id}/connection.json` | Disconnect shop |

### Catalog (Blueprints & Print Providers)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/catalog/blueprints.json` | List all product blueprints |
| GET | `/v1/catalog/blueprints/{id}.json` | Get blueprint details |
| GET | `/v1/catalog/blueprints/{id}/print_providers.json` | List providers for blueprint |
| GET | `/v1/catalog/blueprints/{bp_id}/print_providers/{pp_id}/variants.json` | Get variants (size/color combos) |
| GET | `/v1/catalog/blueprints/{bp_id}/print_providers/{pp_id}/shipping.json` | Get shipping info |
| GET | `/v1/catalog/print_providers.json` | List all print providers |
| GET | `/v1/catalog/print_providers/{id}.json` | Get provider details |

### Products
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/shops/{shop_id}/products.json` | List products (paginated) |
| GET | `/v1/shops/{shop_id}/products/{id}.json` | Get product details |
| POST | `/v1/shops/{shop_id}/products.json` | Create product |
| PUT | `/v1/shops/{shop_id}/products/{id}.json` | Update product |
| DELETE | `/v1/shops/{shop_id}/products/{id}.json` | Delete product |
| POST | `/v1/shops/{shop_id}/products/{id}/publish.json` | Publish product (locks it) |
| POST | `/v1/shops/{shop_id}/products/{id}/publishing_succeeded.json` | Confirm publish success (unlocks) |
| POST | `/v1/shops/{shop_id}/products/{id}/publishing_failed.json` | Confirm publish failure (unlocks) |
| POST | `/v1/shops/{shop_id}/products/{id}/unpublish.json` | Unpublish product |

### Orders
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/shops/{shop_id}/orders.json` | List orders (paginated, filterable) |
| GET | `/v1/shops/{shop_id}/orders/{id}.json` | Get order details |
| POST | `/v1/shops/{shop_id}/orders.json` | Create order |
| POST | `/v1/shops/{shop_id}/orders/{id}/shipping.json` | Calculate shipping |
| POST | `/v1/shops/{shop_id}/orders/{id}/submit.json` | Submit for production |
| DELETE | `/v1/shops/{shop_id}/orders/{id}.json` | Cancel order (only if on-hold/payment-not-received) |

### Uploads (Image Management)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/uploads/images.json` | List uploaded images |
| GET | `/v1/uploads/images/{id}.json` | Get image details |
| POST | `/v1/uploads/images.json` | Upload image (URL or base64) |
| POST | `/v1/uploads/images/{id}/archive.json` | Archive image |

### Webhooks
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/shops/{shop_id}/webhooks.json` | List webhooks |
| GET | `/v1/shops/{shop_id}/webhooks/{id}.json` | Get webhook details |
| POST | `/v1/shops/{shop_id}/webhooks.json` | Create webhook |
| PUT | `/v1/shops/{shop_id}/webhooks/{id}.json` | Update webhook |
| DELETE | `/v1/shops/{shop_id}/webhooks/{id}.json` | Delete webhook |

**Webhook Event Topics**:
- `product:deleted`, `product:publish:started`, `product:publish:succeeded`, `product:publish:failed`
- `order:created`, `order:updated`, `order:sent-to-production`
- `order:shipment:created`, `order:shipment:delivered`

## Architecture

### Directory Structure
```
src/
├── admin/
│   ├── components/          # Shared UI components
│   ├── routes/              # Dedicated admin pages (needs creation)
│   │   └── printify/
│   │       ├── page.tsx             # Main /a/printify dashboard
│   │       ├── products/page.tsx    # Product management
│   │       ├── orders/page.tsx      # Order management
│   │       ├── catalog/page.tsx     # Blueprint/catalog browser
│   │       ├── uploads/page.tsx     # Image upload management
│   │       └── settings/page.tsx    # Configuration/settings
│   └── widgets/             # Existing widgets (keep for contextual use)
├── api/
│   ├── admin/printify/      # Authenticated admin endpoints
│   └── store/printify/      # Public storefront endpoints
├── modules/printify/
│   ├── models/              # DML data models
│   ├── services/            # Business logic services
│   ├── migrations/          # Database migrations
│   └── utils/               # Helpers, logger, error handling
└── workflows/               # MedusaJS workflows (needs creation)
```

### Admin Page Structure

The plugin should register a dedicated admin section at `/a/printify` using MedusaJS admin routing. Each page is a React component using `@medusajs/ui` components.

**Pages**:
1. **Dashboard** (`/a/printify`) - Overview stats, recent activity, quick actions
2. **Products** (`/a/printify/products`) - DataTable of synced products, enable/disable, sync controls
3. **Product Detail** (`/a/printify/products/:id`) - Full product view with variants, images, print areas
4. **Orders** (`/a/printify/orders`) - Order list with status filters, tracking info
5. **Order Detail** (`/a/printify/orders/:id`) - Order details, submit/cancel actions, shipping tracking
6. **Catalog Browser** (`/a/printify/catalog`) - Browse Printify blueprints and print providers
7. **Image Uploads** (`/a/printify/uploads`) - Upload and manage print images
8. **Settings** (`/a/printify/settings`) - API credentials, sync config, webhook management

### Data Flow
```
Printify API <-> PrintifyApiClient <-> Services <-> API Routes <-> Admin UI
                                          |
                                    DML Models (DB)
```

### Key Patterns

**MedusaJS Admin Pages**: Use `defineRouteConfig` from `@medusajs/admin-sdk` to register pages with sidebar navigation. Each route file exports a React component and a config.

**MedusaJS Widgets**: Keep existing widgets for injecting Printify context into standard MedusaJS pages (e.g., showing Printify status on the product list page).

**Services must use MikroORM**: All service methods need actual database queries using the container's entity manager, not stub implementations.

**Workflows for long-running operations**: Product sync, order submission, and bulk operations should be implemented as MedusaJS workflows with proper step definitions and compensation logic.

## Implementation Priorities

### Phase 1: Core Infrastructure
1. Wire up service layer to actual database via MikroORM repositories
2. Replace all stub implementations with real CRUD operations
3. Ensure all 82 existing tests still pass after changes

### Phase 2: Admin Pages
1. Create dedicated admin route structure at `src/admin/routes/printify/`
2. Build settings page (migrate from configuration widget)
3. Build product management page with DataTable, sync, enable/disable
4. Build order management page with status tracking
5. Register sidebar navigation entry for "Printify" section

### Phase 3: Extended Printify API Coverage
1. Add catalog/blueprint browsing endpoints to API client
2. Add image upload endpoints to API client
3. Add webhook management endpoints to API client
4. Add shipping calculation endpoints to API client
5. Build corresponding admin pages for catalog and uploads

### Phase 4: Workflows & Automation
1. Implement product sync workflow with batching and streaming
2. Implement order submission workflow with retry logic
3. Add scheduled job for automatic product sync
4. Implement webhook receiver endpoints for real-time updates

### Phase 5: Product Creation & Publishing
1. Build product creation flow (select blueprint -> provider -> variants -> upload images -> create)
2. Implement publishing workflow (lock -> sync -> confirm)
3. Add product editing capabilities
4. Link Printify products to Medusa products

## Technical Constraints

- **MedusaJS v2.11+**: Use `@medusajs/framework` imports exclusively
- **DML Models**: All data models must use `model.define()` from `@medusajs/framework/utils`
- **TypeScript Strict**: No `any` types in production code (existing uses should be replaced)
- **Admin UI**: Use `@medusajs/ui` components and `@medusajs/admin-sdk` for routing
- **Test Coverage**: All 82 existing tests must continue passing; new code needs tests
- **Rate Limiting**: Respect Printify API limits (600/min global, 100/min catalog, 200/30min publish)
- **Error Handling**: Use `ErrorFactory` patterns from `src/modules/printify/utils/error-handling.ts`
- **Logging**: Use structured logger from `src/modules/printify/utils/logger.ts`

## Commands

```bash
npm run build          # TypeScript compilation
npm test               # Run all 82 tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npm run lint           # ESLint
npm run lint:fix       # Auto-fix lint issues
npm run validate       # typecheck + lint + test
npm run dev:push       # Build and push to yalc for local testing
```
