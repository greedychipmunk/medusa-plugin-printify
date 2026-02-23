# MedusaJS Printify Plugin - AI Assistant Guidelines

**Date**: January 10, 2026  
**Plugin Version**: 1.0.0  
**MedusaJS Version**: v2.11.0+  
**Status**: Production Ready ✅

## Project Overview

This is a comprehensive MedusaJS v2.11+ plugin that integrates with Printify for print-on-demand product management and order fulfillment. The plugin has been fully modernized with DML (Data Model Layer) patterns, modern import structures, and comprehensive testing.

### Plugin Capabilities

- **Product Management**: Sync Printify products with Medusa store, inventory management, bulk operations
- **Order Processing**: Automatic order submission to Printify, real-time status sync, tracking management
- **Shopping Cart Integration**: Add Printify products to cart, validation, custom options
- **Admin Dashboard**: Configuration management, order interface, analytics, margin reporting
- **Modern Architecture**: DML entities, TypeScript, comprehensive test coverage (545 tests)

## Architecture & Modernization Status

### ✅ **Phase 4 Complete**: DML Integration
- **Modern Data Models**: All models converted to MedusaJS v2 DML patterns with full type safety
- **Service Layer**: Updated services using DML entities while maintaining legacy API compatibility
- **Bridge Pattern**: Seamless backward compatibility ensuring zero breaking changes
- **Test Coverage**: 151/169 tests passing across 12 test suites

### ✅ **Phase 5 Complete**: API Routes Modernization
- **Modern Import Patterns**: All routes using `@medusajs/framework/http` imports
- **Request/Response Types**: `AuthenticatedMedusaRequest` and `MedusaResponse` throughout
- **Build Validation**: Clean TypeScript compilation with modern patterns
- **Functionality Preservation**: All existing behavior maintained

### ✅ **Phase 5b Complete**: Admin UI + Workflow Links + Test Coverage
- **Product Stats Endpoint**: `GET /admin/printify/products/stats` returns aggregated product statistics
- **Products Page**: Added "Medusa Link" column showing linked/unlinked status per product
- **Order Detail Page**: Shows linked Medusa order badge with display ID
- **Submit Workflow**: `updateOrderRecordStep` creates module link to Medusa order
- **Test Coverage**: 169/169 tests across 15 suites — link service, cart validation, order enrichment

### ✅ **Phase 7 Complete**: Webhook Enhancements
- **Webhook Registration API**: Admin CRUD endpoints for managing Printify webhooks (`GET/POST /admin/printify/webhooks`, `DELETE /admin/printify/webhooks/:id`)
- **API Client Methods**: `listWebhooks()`, `createWebhook()`, `deleteWebhook()` on `PrintifyApiClient`
- **Expanded Events**: 7 webhook event types handled — `order:status-changed`, `order:shipped`, `product:updated`, `product:deleted`, `order:sent-to-production`, `order:shipment:delivered`, `shop:disconnected`
- **Immediate Product Sync**: `product:updated` now fetches fresh data from Printify API immediately instead of just marking for re-sync
- **Proper Test Coverage**: 16 webhook handler tests with mocked services, 5 API client tests, 5 admin route tests
- **Test Coverage**: 151/169 tests across 12 suites

### ✅ **Phase 8 Complete**: Shipping Rate Integration
- **Shipping Rates Endpoint**: `POST /store/printify/shipping/rates` fetches live shipping options from Printify API
- **API Client Method**: `calculateShipping()` on `PrintifyApiClient` — handles both `{ shipping: [...] }` and direct array response formats
- **In-Memory TTL Cache**: `ShippingRateCache` with SHA-256 key hashing, 15-minute TTL, and auto-cleanup
- **Dynamic Shipping Method**: Order submission now accepts `shipping_method` instead of hardcoding `1` — flows through `CreateOrderRequest`, `preparePrintifyOrderData`, workflow steps, and admin order creation
- **Test Coverage**: 169/169 tests across 15 suites (4 API client + 7 cache + 7 endpoint tests added)

### ✅ **Phase 9 Complete**: Automation Dashboard + Scheduled Jobs
- **New Config Field**: `auto_submit_orders` boolean on configuration model (defaults to `false`)
- **Scheduled Jobs**: `sync-printify-products` and `auto-submit-orders` jobs run every 5 minutes, respecting config flags and sync frequency
- **Automation Activity Store**: In-memory singleton tracking job run status, timestamps, success/failure counts per configuration
- **Status Endpoint**: `GET /admin/printify/automation/status` returns config toggles + job activity
- **Toggle Endpoint**: `PUT /admin/printify/automation/toggle` lightweight toggle for `sync_enabled` and `auto_submit_orders`
- **Dashboard Widget**: Automation Activity widget with live status, inline Switch toggles, auto-refresh every 30 seconds
- **Settings Page**: Added auto_submit_orders toggle in Order Auto-Submit section
- **Test Coverage**: 190/190 tests across 19 suites (5 activity store + 5 sync job + 5 auto-submit job + 6 API endpoint tests added)

### Phase 10 Complete: Retry & Dead Letter Queue
- **Persisted Retry Tracking**: `retry_count` and `last_error_at` fields on PrintifyOrder model
- **Dead Letter Queue**: Orders automatically move to `FAILED` status after `max_order_retries` consecutive failures (configurable per store, default 3)
- **Retry Logic**: Auto-submit job increments retry_count, writes error_details/last_error_at on each failure
- **Success Reset**: retry_count resets to 0 on successful submission
- **Admin Retry Endpoint**: `POST /admin/printify/orders/:id/retry` resets FAILED orders back to PENDING
- **Visibility**: Order list/detail responses now expose retry_count, error_details, last_error_at
- **Activity Tracking**: `orders_dead_lettered` counter in automation activity store
- **Test Coverage**: 481/481 tests across 47 suites

### Phase 11 Complete: Email Notifications via Event Bus
- **Configuration Fields**: `notification_emails` (comma-separated), `notify_dead_lettered_orders`, `notify_failed_syncs`, `notify_webhook_errors` on configuration model
- **Event Types**: `printify.order.dead_lettered`, `printify.sync.failed`, `printify.webhook.failed`
- **Notification Emitter**: Config-aware, fire-and-forget utility (`emitNotification`) that checks flags, parses emails, and emits via `IEventBusService`
- **Integration Points**: Auto-submit job (dead-lettered orders), sync job (failed syncs), webhook route (processing errors)
- **Reference Subscriber**: `printify-notification-logger.ts` logs all events at warn level as documentation
- **Admin UI**: Notification Settings panel with email input and 3 toggle switches
- **Config API**: All CRUD endpoints expose notification fields via zod validation
- **Test Coverage**: 507/507 tests across 49 suites (13 emitter + 4 config + 2 auto-submit + 2 sync + 2 webhook + 3 model tests added)

### Phase 12 Complete: Order Cost Tracking
- **Cost Fields**: `total_cost` (number, default 0) and `cost_per_item` (JSON, nullable) on PrintifyOrder model
- **Immutable Cost Snapshot**: Production costs captured at order creation time from product `printify_data.variants[].cost`
- **Service Layer**: `fetchVariantCosts()` helper, cost calculation in `createOrderFromCart`, cost aggregation in `getOrderStatsForConfig`
- **Bridge Getters**: `totalCost`, `costPerItem`, `profit`, `marginPercent` on `PrintifyOrderBridge`
- **API Endpoints**: Cost/margin fields exposed in order list, detail (inside pricing), and stats responses
- **Admin UI**: Margin % column with color coding in order list, Cost & Margin section with per-item breakdown in order detail, Profit Metrics cards on dashboard
- **Backward Compatible**: Legacy orders get `total_cost: 0`, `cost_per_item: null` — UI hides cost section gracefully
- **Test Coverage**: 545/545 tests across 53 suites (10 model + 12 service + 8 endpoint + 8 integration tests added)

## Key Components

### Models (DML-based)
```
src/modules/printify/models/
├── printify-configuration.ts    # Plugin configuration with encryption
├── printify-product.ts          # Product enablement and sync tracking
├── printify-order.ts           # Complete order lifecycle management
├── printify-product-variant.ts # Variant-specific data and pricing
└── printify-cart-item.ts       # Shopping cart integration
```

### Services
```
src/modules/printify/services/
├── printify-api-client.ts           # Printify API integration
├── printify-configuration-service.ts # Configuration management
├── printify-product-service.ts      # Product operations
├── printify-order-service.ts        # Order processing (17 tests)
├── printify-cart-service.ts         # Cart management (6 tests)
└── storefront-product-service.ts    # Public product APIs
```

### API Routes (Modern Patterns)
```
src/api/admin/printify/
├── config/route.ts                  # Configuration CRUD
├── orders/route.ts                  # Order management
├── products/route.ts                # Product operations
└── [various]/route.ts               # Bulk operations, stats, etc.
```

### Admin Widgets
```
src/admin/widgets/
├── printify-configuration-widget.tsx    # API configuration UI
└── printify-product-management-widget.tsx # Product management UI
```

## Development Guidelines

### Code Standards
- **TypeScript 5.x** with strict typing enabled
- **MedusaJS v2.11+** modern import patterns using `@medusajs/framework`
- **DML entities** for all data models with bridge compatibility
- **Comprehensive testing** - maintain 100% critical path coverage (507 tests)
- **Error handling** with retry logic and user-friendly messages

### Import Patterns (CRITICAL)
Always use modern MedusaJS v2.11+ imports:

```typescript
// ✅ Correct - Modern patterns
import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { defineConfig } from "@medusajs/framework/utils"

// ❌ Incorrect - Legacy patterns that will break
import { Request, Response } from 'express'
import { MedusaContainer } from "@medusajs/types"
```

### DML Model Patterns
All models use modern DML architecture:

```typescript
import { model } from "@medusajs/framework/utils"

const PrintifyProduct = model.define("printify_product", {
  id: model.id().primaryKey(),
  printify_product_id: model.text().unique(),
  title: model.text(),
  enabled: model.boolean().default(false),
  // ... additional fields
})

export default PrintifyProduct
```

### Service Layer Integration
Services use bridge patterns for compatibility:

```typescript
export class PrintifyOrderService {
  // Modern DML entity usage with legacy compatibility
  async createOrder(cartItems: CartItem[]): Promise<PrintifyOrderBridge> {
    const entity = await this.printifyOrderModel_.create(data)
    return new PrintifyOrderBridge(entity) // Bridge provides legacy API
  }
}
```

## Testing Requirements

### Test Coverage
- **545 tests total** across 53 test suites
- **100% success rate** required for any changes
- **Critical path coverage** for all user-facing functionality
- **DML model validation** with both entity and bridge patterns
- **Integration tests** mock only the HTTP boundary (axios), exercising real business logic

### Test Structure
```
tests/
├── integration/
│   ├── helpers/
│   │   ├── test-service-factory.ts              # In-memory CRUD service builder
│   │   └── mock-printify-api.ts                 # Axios mock + Printify API fixtures
│   ├── order-lifecycle.test.ts                  # 13 order lifecycle tests
│   ├── product-sync-lifecycle.test.ts           # 10 product sync tests
│   ├── webhook-handling.test.ts                 # 9 webhook integration tests
│   ├── shipping-rates.test.ts                   # 6 shipping/cache tests
│   ├── scheduled-jobs.test.ts                   # 14 sync job + auto-submit job tests
│   ├── bulk-order-lifecycle.test.ts             # 7 bulk order lifecycle tests
│   └── order-cost-lifecycle.test.ts             # 6 order cost lifecycle tests
├── unit/
│   ├── api/
│   │   ├── admin-endpoints.test.ts              # 28 API tests
│   │   ├── cart-validation.test.ts              # 6 cart validation tests
│   │   ├── storefront-endpoints.test.ts         # 14 storefront tests
│   │   ├── webhook-endpoints.test.ts             # 16 webhook handler tests
│   │   ├── webhook-admin-endpoints.test.ts      # 5 admin webhook tests
│   │   ├── automation-endpoints.test.ts         # 6 automation API tests
│   │   ├── notification-config-endpoints.test.ts    # 4 notification config tests
│   │   └── order-cost-endpoints.test.ts             # 8 order cost endpoint tests
│   ├── order-retry-endpoint.test.ts         # 4 retry endpoint tests
│   └── bulk-order-endpoints.test.ts         # 15 bulk order endpoint tests
│   ├── models/
│   │   ├── printify-configuration-dml.test.ts   # 13 model tests
│   │   ├── printify-product-dml.test.ts         # 14 model tests
│   │   └── printify-order-dml.test.ts           # 10 order cost model tests
│   ├── services/
│   │   ├── printify-cart-service.test.ts            # 6 service tests
│   │   ├── printify-link-service.test.ts            # 14 link/module tests
│   │   ├── printify-order-service.test.ts           # 19 service tests
│   │   ├── printify-api-client-webhooks.test.ts     # 5 API client webhook tests
│   │   ├── printify-api-client-shipping.test.ts     # 4 API client shipping tests
│   │   ├── bulk-order-service.test.ts               # 9 bulk order service tests
│   │   └── printify-order-cost-service.test.ts      # 12 order cost service tests
│   ├── jobs/
│   │   ├── sync-products-job.test.ts                # 5 sync job tests
│   │   ├── auto-submit-orders-job.test.ts           # 5 auto-submit job tests
│   └── auto-submit-retry.test.ts                # 6 retry/dead-letter tests
│   ├── utils/
│   │   ├── shipping-cache.test.ts                   # 7 cache tests
│   │   ├── automation-activity.test.ts              # 5 activity store tests
│   │   └── notification-emitter.test.ts             # 13 emitter tests
│   └── ...
└── setup.ts
```

### Running Tests
```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage reports
```

## Third-Party Integration Best Practices

### Printify API Integration
Following MedusaJS best practices for third-party syncing:

1. **Use Workflows** for long-running operations
2. **Batch Processing** for bulk data operations  
3. **Streaming** for large datasets to avoid memory issues
4. **Retry Logic** with exponential backoff
5. **Error Handling** with comprehensive logging

### Syncing Patterns
```typescript
// Example: Product sync workflow
export const syncProductsWorkflow = createWorkflow(
  "sync-printify-products",
  (input: SyncProductsInput) => {
    const products = streamProductsFromPrintify(input)
    const batches = batchProducts(products, 50)
    
    return transform(batches, async (batch) => {
      return await batchProductsWorkflow(container).run({
        input: { create: batch.toCreate, update: batch.toUpdate }
      })
    })
  }
)
```

## Configuration & Environment

### Required Environment Variables
```bash
# MedusaJS v2 Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/medusa-store"
REDIS_URL="redis://localhost:6379"
JWT_SECRET=your_jwt_secret_here
COOKIE_SECRET=your_cookie_secret_here

# Printify Integration
PRINTIFY_API_KEY=your_printify_api_key_here
PRINTIFY_SHOP_ID=your_printify_shop_id_here
PRINTIFY_WEBHOOK_SECRET=your_webhook_secret_here

# Plugin Configuration
PRINTIFY_SYNC_ENABLED=true
PRINTIFY_SYNC_FREQUENCY=60
PRINTIFY_LOG_LEVEL=info
```

### Module Configuration (medusa-config.ts)
```typescript
import { defineConfig } from "@medusajs/framework/utils"

export default defineConfig({
  modules: [
    {
      resolve: "@trendtri/medusa-plugin-printify",
      options: {
        apiKey: process.env.PRINTIFY_API_KEY,
        shopId: process.env.PRINTIFY_SHOP_ID,
        webhookSecret: process.env.PRINTIFY_WEBHOOK_SECRET,
        sync: {
          enabled: process.env.PRINTIFY_SYNC_ENABLED === "true",
          frequency: parseInt(process.env.PRINTIFY_SYNC_FREQUENCY || "60"),
          batchSize: 100,
        },
        logging: {
          level: process.env.PRINTIFY_LOG_LEVEL || "info",
          structured: false,
        },
      },
    },
  ],
})
```

## API Endpoints

### Admin Endpoints (Authenticated)
```
Configuration:
GET    /admin/printify/config           # Get current configuration
POST   /admin/printify/config           # Create/update configuration  
POST   /admin/printify/config/test      # Test API connection

Products:
GET    /admin/printify/products         # List products with pagination
POST   /admin/printify/products/sync    # Sync specific products
POST   /admin/printify/products/bulk    # Bulk enable/disable operations
POST   /admin/printify/products/:id/enable   # Enable single product
POST   /admin/printify/products/:id/disable  # Disable single product

Webhooks:
GET    /admin/printify/webhooks         # List registered webhooks
POST   /admin/printify/webhooks         # Register new webhook
DELETE /admin/printify/webhooks/:id     # Remove webhook

Automation:
GET    /admin/printify/automation/status  # Get automation job status + config
PUT    /admin/printify/automation/toggle  # Toggle sync_enabled / auto_submit_orders

Orders:
GET    /admin/printify/orders           # List orders with filters
POST   /admin/printify/orders           # Create order manually
GET    /admin/printify/orders/:id       # Get order details
POST   /admin/printify/orders/:id/submit    # Submit to Printify
POST   /admin/printify/orders/:id/cancel    # Cancel order
POST   /admin/printify/orders/:id/retry     # Retry failed order (resets to PENDING)
POST   /admin/printify/orders/:id/sync      # Sync status from Printify
GET    /admin/printify/orders/stats     # Order statistics
POST   /admin/printify/orders/bulk-submit  # Bulk submit orders (max 100)
POST   /admin/printify/orders/bulk-cancel  # Bulk cancel orders (max 100)
POST   /admin/printify/orders/bulk-retry   # Bulk retry failed orders (max 100)
```

### Storefront Endpoints (Public)
```
Products:
GET    /store/printify/products         # List available products
GET    /store/printify/products/:id     # Get product details

Cart:
POST   /store/printify/cart/validate    # Validate cart items

Shipping:
POST   /store/printify/shipping/rates   # Get shipping rates for items + address
```

## Error Handling & Logging

### Error Classification
- **validation_error**: Invalid input data (no retry, user-friendly)
- **inventory_error**: Stock issues (no retry, user-friendly)
- **network_error**: Connection issues (retry with backoff)
- **rate_limit_error**: API limits (retry with backoff)
- **api_error**: General API errors (retry with backoff)

### Logging Patterns
```typescript
import { Logger } from "../utils/logger"

// Structured logging with context
logger.error("Failed to sync product", {
  productId: "printify_123",
  error: error.message,
  context: { retryAttempt: 2, batchSize: 50 }
})
```

## Subscribers

```
src/subscribers/
└── printify-notification-logger.ts  # Reference logger for all 3 notification events
```

## Scheduled Jobs

```
src/jobs/
├── sync-printify-products.ts   # Product sync every 5 min (requires sync_enabled)
└── auto-submit-orders.ts       # Order auto-submit every 5 min (requires auto_submit_orders)
```

Both jobs respect their config flags, skip when already running, and track activity in the `automationActivityStore` singleton. The sync job also respects the `sync_frequency` setting.

## Key Development Commands

```bash
# Development
npm run build            # Compile TypeScript
npm run watch           # Development with watch mode
npm test               # Run test suite (545 tests)
npm run lint           # ESLint validation
npm run lint:fix       # Auto-fix linting issues

# Database
npx medusa db:generate  # Generate migrations
npx medusa db:migrate   # Run migrations

# Production
npm run build
npm start
```

## Troubleshooting

### Common Issues
1. **TypeScript Compilation Errors**: Ensure using `@medusajs/framework` imports
2. **Test Failures**: Run `npm test` - all tests must pass
3. **DML Entity Issues**: Check bridge pattern implementation
4. **API Connection**: Verify Printify API key and shop ID
5. **Database**: Ensure migrations are run for DML tables

### Debug Mode
```bash
PRINTIFY_LOG_LEVEL=debug npm run dev
```

### # "Uncaught TypeError: Cannot read properties of undefined (reading 'widgetModule')" from medusajs with custom plugin

This error usually means Medusa’s admin is trying to load your plugin’s admin export, but the plugin isn’t exporting a `widgetModule` object in the shape Medusa expects, or it’s not being resolved correctly at all.

Here are the most common causes and fixes:

#### 1. Ensure correct admin export shape

In your plugin’s admin entry (for example `src/admin/index.ts`), you need to export something like:

```ts
import { defineWidgets } from "@medusajs/admin";

export const widgetModule = defineWidgets([
  {
    key: "my-widget",
    label: "My widget",
    // region where the widget will appear
    // e.g. "product.details.after" or similar, depending on your use case
    position: "product.details.after",
    component: () => import("./widgets/my-widget"),
  },
]);
```

If you export the widget directly, or use a different name (e.g. `widgets` instead of `widgetModule`), `plugin.widgetModule` will be `undefined` and you get exactly the error you’re seeing.[^7]

Double‑check:

- File path matches what you configured as the admin entry in `package.json`.
- You are exporting `widgetModule` (named export), not default.
- `defineWidgets` (or the correct helper for your Medusa version) is used, not a plain object.


#### 2. Verify `package.json` of the plugin

Your plugin’s `package.json` should clearly point to the admin entry:

```json
{
  "name": "medusa-plugin-my-plugin",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "exports": {
    ".": {
      "require": "./dist/index.js",
      "import": "./dist/index.mjs"
    },
    "./admin": {
      "require": "./dist/admin/index.js",
      "import": "./dist/admin/index.mjs"
    }
  },
  "medusa": {
    "admin": "dist/admin/index.mjs"
  }
}
```

Key points:

- There is an `./admin` export.
- The paths actually exist after you build (`dist/admin/index.*`).
- The `medusa.admin` field (for newer setups) or whatever your version’s docs specify points to the right file.

If Medusa resolves the plugin but can’t find the `admin` export, the `widgetModule` will be missing.

#### 3. Check build/TS config

If you’re using TypeScript, ensure:

- `module` is set to something compatible like `ESNext` rather than `NodeNext` if you see odd ESM/CJS problems.
- Your build actually emits the `admin` folder and the `widgetModule` export.
- No path aliases are breaking the built output.

A quick check is to open the built `dist/admin/index.js` and verify it really exports `widgetModule`.

#### 4. Confirm Medusa app config

In the Medusa project where you install the plugin, the plugin entry in `medusa-config.js/ts` should just be:

```js
const plugins = [
  // ...
  {
    resolve: "medusa-plugin-my-plugin",
    options: { /* ... */ },
  },
];
```

You should not manually point to admin files from here; Medusa infers them from the plugin’s package exports.

If the dashboard fails only when the plugin is installed, but works otherwise, that’s a strong sign the admin export is malformed or missing.

#### 5. If imports inside the widget break it

Sometimes adding certain imports to your widget (like `dayjs`, `@emotion/react`, etc.) causes the plugin’s admin module to fail to load, which in turn makes `widgetModule` effectively undefined.

Workarounds that have helped others:

- Add problematic deps to `optimizeDeps.include` in `medusa-config`:

```js
const { defineConfig } = require("medusa-config");

module.exports = defineConfig({
  admin: {
    vite: () => ({
      optimizeDeps: {
        include: ["@emotion/react", "dayjs"], // as needed
      },
    }),
  },
  projectConfig: { /* ... */ },
});
```

- Ensure you’re importing from ESM‑friendly entry points of those libraries.

## Version Compatibility

| Plugin Version | MedusaJS Version | Status |
|----------------|------------------|--------|
| 1.x | v2.11.0+ | ✅ Current |
| 0.x | v1.x - v2.10.x | ❌ Legacy |

## AI Assistant Instructions

When working with this plugin:

1. **Always maintain modern import patterns** - use `@medusajs/framework` imports
2. **Preserve test coverage** - all 545 tests must continue passing
3. **Use DML entities** with bridge compatibility for any model changes
4. **Follow TypeScript strict typing** - no `any` types in production code
5. **Implement proper error handling** with retry logic for external APIs
6. **Use streaming and batching** for large data operations
7. **Document all changes** in both code and relevant markdown files
8. **Test thoroughly** - run full test suite before any commits

The plugin is production-ready and fully modernized for MedusaJS v2.11+. Any modifications should maintain this high standard of architecture and testing coverage.
