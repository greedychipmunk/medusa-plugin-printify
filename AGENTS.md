# AGENTS.md — medusa-plugin-printify

A Medusa v2 plugin that enables merchants to manage, display, and sell [Printify](https://printify.com) print-on-demand products. It wraps the [Printify API](https://developers.printify.com) and integrates it into the Medusa commerce platform — syncing products, submitting orders, handling webhooks, and surfacing Printify management in the Medusa Admin dashboard.

---

## Overview

This plugin is consumed by a Medusa v2 application. See the [Medusa plugin docs](https://docs.medusajs.com/learn/fundamentals/plugins) for how to register and run it inside a host app.

---

## Project Structure

```
src/
├── admin/          # React widgets and UI routes for the Medusa Admin dashboard
├── api/            # API routes (admin + storefront) and webhook endpoint
│   ├── admin/      # Admin-only routes (authenticated)
│   └── store/      # Storefront routes (public)
├── jobs/           # Scheduled background jobs
├── links/          # Module links (connect Printify data to Medusa entities)
├── modules/        # Custom Medusa modules with data models and services
├── providers/      # Module providers (e.g. fulfillment, notification)
├── subscribers/    # Event-driven handlers (e.g. order.placed → submit to Printify)
└── workflows/      # Medusa workflows wrapping Printify operations
```

Built output goes to `.medusa/server/` — do not edit files there directly.

---

## Architecture

### Modules (`src/modules/`)

Custom modules hold data models and services for Printify-specific entities (shops, products, orders). Each module follows this structure:

```
src/modules/<name>/
├── models/         # DML data model definitions
├── service.ts      # Extends MedusaService, auto-generates CRUD
└── index.ts        # Exports Module() definition and module key constant
```

Data models use Medusa's DML (`model.define()`). Example:

```ts
import { model } from "@medusajs/framework/utils"

const PrintifyProduct = model.define("printify_product", {
  id: model.id().primaryKey(),
  printify_id: model.text(),
  title: model.text(),
})
```

Services extend `MedusaService` which auto-generates `list*`, `retrieve*`, `create*`, `update*`, `delete*` methods for each model.

### Workflows (`src/workflows/`)

Workflows are the preferred way to implement multi-step operations. They are transactional (can roll back on failure) and composable.

```ts
import { createWorkflow, createStep } from "@medusajs/framework/workflows-sdk"

const myStep = createStep("step-id", async (input, { container }) => {
  // use container.resolve() to access services
})

export const myWorkflow = createWorkflow("workflow-id", (input) => {
  return myStep(input)
})
```

Export all workflows from `src/workflows/index.ts` so they're available via the `./workflows` package export.

### Subscribers (`src/subscribers/`)

Subscribers react to Medusa events (e.g. `order.placed`). Use them to trigger Printify actions in response to commerce events.

The `order.placed` subscriber checks `PRINTIFY_DRY_RUN` (env var) and skips Printify order creation when set to `true`. Set this in the staging Infisical environment to prevent test orders from creating real Printify orders.

```ts
export default async function handler({ event: { data }, container }) {
  // resolve services, call workflows
}

export const config = {
  event: "order.placed",
}
```

### Jobs (`src/jobs/`)

Scheduled jobs run on a cron-like schedule. Use them for periodic syncs (e.g. pull Printify product catalog, check order status).

```ts
export default async function job(container) {
  // resolve services, do work
}

export const config = {
  name: "sync-printify-products",
  schedule: "0 * * * *", // every hour
}
```

### API Routes (`src/api/`)

File-based routing. A file at `src/api/admin/printify/shops/route.ts` maps to `GET /admin/printify/shops`.

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve("printify")
  res.json({ shops: await service.listShops() })
}
```

Admin routes are automatically authenticated. Storefront routes under `src/api/store/` are public.

### Webhooks

Printify sends webhook events to a single endpoint (e.g. `POST /webhooks/printify`). The handler verifies the HMAC signature using `timingSafeEqual` and routes to the appropriate logic based on event type.

**Handled event types:**
- `order:status-changed`
- `order:shipped`
- `order:sent-to-production`
- `order:shipment:delivered`
- `product:updated`
- `product:deleted`
- `shop:disconnected`

> **Important:** Always check `signature.length !== expected.length` before calling `timingSafeEqual` — mismatched buffer sizes throw a `RangeError`.

### Admin UI (`src/admin/`)

Widgets are React components injected into existing Medusa Admin pages. UI routes add entirely new pages.

```ts
// Widget example
import { defineWidgetConfig } from "@medusajs/admin-sdk"

const PrintifyWidget = () => <div>Printify status</div>

export const config = defineWidgetConfig({ zone: "order.details.after" })
export default PrintifyWidget
```

Admin UI components should use `@medusajs/ui` and `@medusajs/icons` for visual consistency.

### Module Links (`src/links/`)

Links connect Printify module data to core Medusa entities without coupling the modules together. For example, linking a `PrintifyProduct` to a Medusa `Product`.

---

## Development Workflow

### Prerequisites

- Node.js >= 20
- PostgreSQL (for migrations)
- A separate Medusa application to test the plugin in

### Commands (run in plugin directory)

| Command | Purpose |
|---|---|
| `pnpm dev` | Watch for changes and push to local Yalc registry |
| `pnpm build` | Build plugin for production / publishing |
| `pnpm medusa plugin:publish` | Publish to local Yalc registry (first time only) |
| `pnpm medusa plugin:db:generate` | Generate DB migrations for plugin modules |

### First-Time Local Setup

1. In the plugin directory, publish to the local registry:
   ```bash
   pnpm medusa plugin:publish
   ```

2. In the Medusa application directory, install the plugin:
   ```bash
   pnpm medusa plugin:add medusa-plugin-printify
   ```

3. Register the plugin in `medusa-config.ts`:
   ```ts
   plugins: [
     {
       resolve: "medusa-plugin-printify",
       options: {
         printifyApiKey: process.env.PRINTIFY_API_KEY,
         // ... other options
       },
     },
   ]
   ```

4. Start watching the plugin for changes:
   ```bash
   pnpm dev
   ```

5. Run the Medusa application in a separate terminal.

### Generating and Running Migrations

Add to the plugin's `.env`:
```
DB_USERNAME=postgres
DB_PASSWORD=...
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_db_name
```

Then generate and apply:
```bash
# In plugin directory
pnpm medusa plugin:db:generate

# In Medusa application directory
pnpm medusa db:migrate
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PRINTIFY_API_KEY` | Yes | Printify personal access token |
| `PRINTIFY_WEBHOOK_SECRET` | Yes | Secret for verifying Printify webhook signatures |
| `PRINTIFY_DRY_RUN` | No | When `true`, `order.placed` events skip Printify order creation. Set in the staging Infisical environment. |
| `DB_*` | Dev only | PostgreSQL credentials for generating migrations |

---

## Testing

Tests live in `tests/` alongside the source. The project uses Jest.

### Key Patterns

**`resetMocks: true` in Jest config** — mock implementations set inside `jest.mock()` factories are cleared between tests. Always re-set implementations in `beforeEach`:

```ts
beforeEach(() => {
  (mockService.someMethod as jest.Mock).mockResolvedValue(expectedValue)
})
```

**Mocking axios** — use a factory that returns the default export with a `create` method, then configure the mock instance in `beforeEach`:

```ts
jest.mock("axios", () => ({ __esModule: true, default: { create: jest.fn() } }))

beforeEach(() => {
  (axios.create as jest.Mock).mockReturnValue({
    get: jest.fn(),
    post: jest.fn(),
  })
})
```

**Mocking workflows** — use a factory with `__esModule: true`, then configure `.mockReturnValue({ run: mockRunFn })` in `beforeEach`:

```ts
jest.mock("../workflows/sync-products", () => ({
  __esModule: true,
  syncProductsWorkflow: jest.fn(),
}))

beforeEach(() => {
  (syncProductsWorkflow as jest.Mock).mockReturnValue({ run: mockRun })
})
```

**Integration tests** — use `createTestService()` from `tests/integration/helpers/test-service-factory.ts`. It mocks only the `MedusaService` base class and wires in-memory CRUD stores; all business logic runs for real.

### Running Tests

```bash
pnpm test                    # all tests
pnpm test -- --watch         # watch mode
pnpm test -- path/to/test    # single file
```

---

## Release Process

CI owns releases end-to-end. Merge a PR with a Conventional Commit title; the rest is automated.

- **PR title controls the bump.** `fix:` → patch, `feat:` → minor, `type!:` or `BREAKING CHANGE:` footer → major. Other prefixes (`chore:`, `docs:`, etc.) merge with no release. Logic: `.github/scripts/compute-bump.sh`. Allowed prefixes are enforced by the `pr-title-lint` CI job.
- **Never edit `package.json#version` in a PR.** The `version-field-guard` CI job will reject it. The release workflow queries npm (`npm view`) for the current version — `version` on `main` intentionally lags and nothing reads it.
- **Main is branch-protected.** The release workflow can push tags but not commits. There are no `chore(release)` commits on `main`; tags point directly at merge commits.
- **Squash-merge convention.** `gh pr merge <n> --squash --delete-branch`.

### Useful commands

```bash
gh run view <id> --log-failed                   # diagnose CI failures
gh pr checks <n> --watch                        # block until PR checks complete
npm view medusa-plugin-printify version         # current published version
npm view medusa-plugin-printify time --json     # publish timestamps (correlate with run history)
```

### Release-workflow gotchas (when editing `.github/workflows/release.yml`)

- `git tag -a` embeds a tagger identity, so it needs `git config user.name`/`user.email` even when no commit is created.
- `git push --follow-tags` uploads tag-referenced commits even when the branch ref-update is rejected — can leave orphan commits. The workflow pushes tags explicitly and tags `HEAD` directly to avoid this.
- `gh release create` without `--target` stores `targetCommitish: main` (a branch ref, not a SHA), so retargeting a tag self-heals its linked release.

---

## Coding Conventions

- **TypeScript** throughout — no `any` without a comment explaining why
- **Medusa framework imports** — always from `@medusajs/framework/*`, not deep internal paths
- **Module keys** — export a `PRINTIFY_MODULE` (or similar) constant from `src/modules/<name>/index.ts` and use it everywhere instead of raw strings
- **DML nullable fields** — when adding `.nullable()` to a model field, update ALL test mocks of `@medusajs/framework/utils` so the `model.*()` mock chains correctly
- **Notifications** — use the `emitNotification(container, config, event, payload)` helper pattern (fire-and-forget; checks config flag and emails before emitting via `IEventBusService`)
- **Cost/price fields** — costs captured immutably at order creation time; never mutate after the fact
- **Webhook signature** — always verify with `timingSafeEqual`; guard against buffer length mismatch before comparison

---

## Medusa Resources

- [Plugin fundamentals](https://docs.medusajs.com/learn/fundamentals/plugins)
- [Modules](https://docs.medusajs.com/learn/fundamentals/modules)
- [Workflows](https://docs.medusajs.com/learn/fundamentals/workflows)
- [API routes](https://docs.medusajs.com/learn/fundamentals/api-routes)
- [Subscribers](https://docs.medusajs.com/learn/fundamentals/events-and-subscribers)
- [Scheduled jobs](https://docs.medusajs.com/learn/fundamentals/scheduled-jobs)
- [Admin widgets](https://docs.medusajs.com/learn/fundamentals/admin/widgets)
- [Admin UI routes](https://docs.medusajs.com/learn/fundamentals/admin/ui-routes)
- [Module links](https://docs.medusajs.com/learn/fundamentals/module-links)

## Printify Resources

- [Printify API docs](https://developers.printify.com)
- [Webhook events reference](https://developers.printify.com/#section/Webhooks)
