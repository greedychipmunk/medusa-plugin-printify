# Medusa Printify Plugin

A comprehensive Medusa v2 plugin that integrates with Printify for print-on-demand product management and order fulfillment.

## Architecture

This plugin is built for **MedusaJS v2.11+** with modern patterns:

- **DML (Data Model Layer)**: Uses MedusaJS v2's modern data modeling with full type safety
- **Bridge Compatibility**: Maintains backward compatibility with existing integrations
- **Modern Import Patterns**: Uses `@medusajs/framework` imports throughout
- **Comprehensive Testing**: 545 tests across 53 suites
- **Modular Architecture**: Clean separation of concerns with service layers
- **Type Safety**: Full TypeScript implementation with strict typing

## Features

**Product Management**
- Sync Printify products with your Medusa store
- Real-time inventory management
- Bulk product enable/disable operations

**Order Processing & Fulfillment**
- Automatic order submission to Printify
- Real-time order status synchronization
- Tracking number management
- Order cancellation and retry support
- Dead letter queue for failed orders

**Shopping Cart Integration**
- Validate Printify products in cart
- Dynamic shipping rate calculation

**Admin Dashboard**
- Complete configuration management
- Order management interface with cost tracking
- Product synchronization tools
- Automation scheduling with toggleable sync and auto-submit
- Webhook event log

**Webhook Support**
- 7 event types: `order:status-changed`, `order:shipped`, `product:updated`, `product:deleted`, `order:sent-to-production`, `order:shipment:delivered`, `shop:disconnected`
- Admin CRUD for registered webhooks

## Prerequisites

- **MedusaJS v2.11.0+**
- **Node.js 18+**
- **PostgreSQL 13+**
- **Redis 6+**
- **Printify account** with API access

## Local Development with Yalc

> **Note:** `npx medusa plugin:publish` will throw a `TypeError: The 'id' argument must be of type string`. Use the yalc workflow below instead. See [MEDUSA_CLI_FIX.md](./MEDUSA_CLI_FIX.md) for details.

### 1. Install yalc globally

```bash
npm install -g yalc
```

### 2. Build and publish the plugin to the local yalc store

```bash
# In the plugin directory
npm run dev:link
```

This runs `npm run build && yalc publish` — compiles TypeScript and publishes to the local yalc registry.

### 3. Link the plugin in your Medusa app

```bash
# In your Medusa app directory
yalc add @trendtri/medusa-plugin-printify
```

### 4. Watch for changes and auto-push during development

```bash
# In the plugin directory (separate terminal)
npm run dev:push:watch
```

This runs `tsc --watch` and `yalc push --watch` concurrently — any file save recompiles and pushes the update to your linked Medusa app automatically.

### Available yalc commands

| Command | Description |
|---------|-------------|
| `npm run dev:link` | Build and publish to local yalc store |
| `npm run dev:push` | Build and push to all linked apps |
| `npm run dev:push:watch` | Watch mode: recompile and push on save |
| `npm run yalc:publish` | Publish to local yalc store (no build) |
| `npm run yalc:push` | Push to linked apps (no build) |

### 5. Configure the plugin in medusa-config.ts

```typescript
import { defineConfig, loadEnv } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  // ... your projectConfig
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

### 6. Environment variables

```bash
# Required
PRINTIFY_API_KEY=your_printify_api_key_here
PRINTIFY_SHOP_ID=your_printify_shop_id_here

# Optional
PRINTIFY_WEBHOOK_SECRET=your_webhook_secret_here
PRINTIFY_SYNC_ENABLED=true
PRINTIFY_SYNC_FREQUENCY=60
PRINTIFY_LOG_LEVEL=info
```

### 7. Run migrations and start

```bash
# In your Medusa app directory
npx medusa db:migrate
npm run dev
```

## Production Install (NPM)

```bash
npm install @trendtri/medusa-plugin-printify
```

Then follow steps 5–7 above.

## API Endpoints

### Admin (authenticated)

**Configuration**
- `GET /admin/printify/config` — Get current configuration
- `POST /admin/printify/config` — Create configuration
- `PUT /admin/printify/config` — Update configuration
- `POST /admin/printify/config/test` — Test API connection

**Products**
- `GET /admin/printify/products` — List synced products
- `GET /admin/printify/products/stats` — Product statistics
- `POST /admin/printify/products/sync` — Sync products from Printify
- `POST /admin/printify/products/:id/enable` — Enable a product
- `POST /admin/printify/products/:id/disable` — Disable a product
- `POST /admin/printify/products/bulk-enable` — Bulk enable products
- `POST /admin/printify/products/bulk-disable` — Bulk disable products

**Orders**
- `GET /admin/printify/orders` — List orders
- `POST /admin/printify/orders` — Create order manually
- `GET /admin/printify/orders/:id` — Get order details
- `PATCH /admin/printify/orders/:id` — Update order
- `GET /admin/printify/orders/stats` — Order statistics
- `POST /admin/printify/orders/:id/submit` — Submit to Printify
- `POST /admin/printify/orders/:id/cancel` — Cancel order
- `POST /admin/printify/orders/:id/retry` — Retry failed order (resets to PENDING)
- `POST /admin/printify/orders/:id/sync` — Sync status from Printify
- `POST /admin/printify/orders/bulk-submit` — Bulk submit (max 100)
- `POST /admin/printify/orders/bulk-cancel` — Bulk cancel (max 100)
- `POST /admin/printify/orders/bulk-retry` — Bulk retry failed orders (max 100)

**Automation**
- `GET /admin/printify/automation/status` — Get automation job status and config toggles
- `PUT /admin/printify/automation/toggle` — Toggle `sync_enabled` / `auto_submit_orders`

**Webhooks**
- `GET /admin/printify/webhooks` — List registered webhooks
- `POST /admin/printify/webhooks` — Register a webhook
- `DELETE /admin/printify/webhooks/:id` — Remove a webhook
- `GET /admin/printify/webhook-events` — List webhook event log
- `GET /admin/printify/webhook-events/:id` — Get event details
- `POST /admin/printify/webhook-events/:id/replay` — Replay an event

**Analytics**
- `GET /admin/printify/analytics` — Analytics data

### Store (public)

- `GET /store/printify/products` — List available products
- `GET /store/printify/products/featured` — Featured products
- `GET /store/printify/products/:id` — Product details
- `GET /store/printify/products/:id/availability` — Product availability
- `POST /store/printify/cart/validate` — Validate cart items
- `POST /store/printify/shipping/rates` — Get shipping rates for items + address
- `GET /store/printify/orders/track` — Track order

### Webhooks

- `POST /hooks/printify` — Printify webhook receiver

## Development Commands

```bash
npm run build           # Compile TypeScript to dist/
npm run watch           # TypeScript watch (no push)
npm test                # Run all 545 tests
npm run test:watch      # Tests in watch mode
npm run test:coverage   # Coverage report
npm run lint            # ESLint
npm run lint:fix        # Auto-fix lint issues
```

## Troubleshooting

**Products not syncing** — Check `sync_enabled` is `true` in your plugin configuration and verify API credentials.

**Orders not submitting** — Verify the order address format and check the order's `error_details` field. Failed orders can be retried via `POST /admin/printify/orders/:id/retry`.

**Webhooks not received** — Confirm your server is publicly accessible over HTTPS and the `webhookSecret` in your config matches what is set in Printify.

**Debug logging**
```bash
PRINTIFY_LOG_LEVEL=debug npm run dev
```

## Contributing

```bash
# Clone and install
git clone https://github.com/specify/medusa-plugin-printify.git
cd medusa-plugin-printify
npm install

# Build
npm run build

# Test
npm test

# Publish locally for integration testing
npm run dev:link
```

## Version Compatibility

| Plugin Version | MedusaJS Version | Status |
|----------------|------------------|--------|
| 1.x | v2.11.0+ | Current |
| 0.x | v1.x – v2.10.x | Legacy |

## License

MIT
