# Fix Printify Products Not Showing on Storefront

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure Printify-synced products reliably appear on the Medusa storefront by fixing sales channel assignment gaps and adding diagnostic logging.

**Architecture:** The fix targets the sync workflow's update path (which silently drops sales channel assignment) and adds a sales channel reconciliation step. We also add warn-level logging at each failure point so silent failures become visible.

**Tech Stack:** Medusa workflows SDK, Medusa Link module, Medusa core-flows (`linkProductsToSalesChannelWorkflow`), Vitest/Jest

---

## Root Cause Analysis

For a product to appear on the storefront, ALL of these must be true:
1. Product `status = "published"`
2. Product linked to a **sales channel** via Medusa's Link module
3. The **publishable API key** used by the storefront is associated with that same sales channel

### Identified Gaps

| # | Gap | Location | Severity |
|---|-----|----------|----------|
| 1 | **Update path skips sales channel assignment** — when an existing Medusa product is updated, `sales_channels` is not set. If a product was created before sales channel config existed, or the link was removed, re-syncs will never restore it. | `sync-products.ts:239-246` | **High** |
| 2 | **No sales channel = silent zero-result** — if `printify_shop.sales_channel_id` is null AND `store.default_sales_channel_id` is null, the workflow returns `{ created: 0, updated: 0 }` with only a warn log. Easy to miss. | `sync-products.ts:164-167` | **Medium** |
| 3 | **`product:deleted` webhook doesn't draft the Medusa product** — only the staging record is updated, leaving the Medusa product "published" | `webhooks/printify/route.ts:84-90` | **Medium** |

**This plan focuses on Gap #1 (the most likely cause) and Gap #2 (diagnostic improvement).**

---

### Task 1: Add sales channel assignment to the update path

**Files:**
- Modify: `src/workflows/sync-products.ts:234-252`
- Test: `tests/unit/workflows/sync-products.test.ts`

**Step 1: Write the failing test**

Add to `tests/unit/workflows/sync-products.test.ts`:

```typescript
it("ensures sales channel link on update path (not just create)", () => {
  // The update branch must also reconcile sales channel assignment
  // so products that lost their channel link get restored on re-sync
  const updateSection = source.substring(source.indexOf("// Update existing"))
  expect(updateSection).toContain("sales_channel_id")
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dcblackhouse/Code/ecommerce/medusa-plugin-printify && npx vitest run tests/unit/workflows/sync-products.test.ts`
Expected: FAIL — the update section does not contain "sales_channel_id"

**Step 3: Implement the fix**

In `src/workflows/sync-products.ts`, modify the update branch (lines 234-252) to also ensure the sales channel link exists:

```typescript
      } else {
        // Update existing linked Medusa product
        try {
          const targetStatus = pp.is_published ? "published" : "draft"

          await productModuleService.updateProducts(medusaProductId, {
            title: pp.title,
            description: pp.description || undefined,
            status: targetStatus as any,
            images: printifyImages.map((img) => ({ url: img.src })),
            options: mapped.medusaOptions,
            variants: buildMedusaVariants(enabledVariants, mapped, pp.printify_id),
          })

          // Ensure sales channel link exists (idempotent — link.create is a no-op if already linked)
          try {
            await link.create({
              [Modules.PRODUCT]: { product_id: medusaProductId },
              [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
            })
          } catch {
            // Link already exists — that's fine
          }

          updated++
          logger.info(`[printify] Updated Medusa product "${pp.title}" (${medusaProductId})`)
        } catch (err) {
          logger.error(`[printify] Failed to update Medusa product ${medusaProductId}: ${err}`)
        }
      }
```

Note: `link` and `salesChannelId` are already resolved earlier in the step. `Modules.SALES_CHANNEL` needs to be available — verify it's imported from `@medusajs/framework/utils`.

**Step 4: Run test to verify it passes**

Run: `cd /Users/dcblackhouse/Code/ecommerce/medusa-plugin-printify && npx vitest run tests/unit/workflows/sync-products.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/workflows/sync-products.ts tests/unit/workflows/sync-products.test.ts
git commit -m "fix: ensure sales channel link on product update path

Previously, the sync workflow only assigned sales channels when creating
new Medusa products. On the update path, sales channel links were skipped,
causing re-synced products to become invisible on the storefront if their
channel link was missing."
```

---

### Task 2: Upgrade sales channel warning to include diagnostic details

**Files:**
- Modify: `src/workflows/sync-products.ts:154-167`

**Step 1: Improve the warning messages**

Replace the current warn/skip block with more actionable logging:

```typescript
    // Resolve sales channel: shop setting → store default → skip
    const shops = await service.listPrintifyShops({ printify_id: shopId })
    let salesChannelId: string | null = shops[0]?.sales_channel_id ?? null

    if (!salesChannelId) {
      const storeService = container.resolve(Modules.STORE)
      const stores = await storeService.listStores({})
      salesChannelId = stores[0]?.default_sales_channel_id ?? null

      if (salesChannelId) {
        logger.info(`[printify] Using store default sales channel: ${salesChannelId}`)
      }
    }

    if (!salesChannelId) {
      logger.error(
        `[printify] PRODUCTS WILL NOT APPEAR ON STOREFRONT — no sales channel configured. ` +
        `Set printify_shop.sales_channel_id via PATCH /admin/printify/shops/${shopId}, ` +
        `or set a default_sales_channel_id on the store. ` +
        `(${printifyProducts.length} published products waiting to sync)`
      )
      return new StepResponse({ created: 0, updated: 0 })
    }
```

**Step 2: Run existing tests**

Run: `cd /Users/dcblackhouse/Code/ecommerce/medusa-plugin-printify && npx vitest run`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/workflows/sync-products.ts
git commit -m "fix: upgrade silent sales channel warning to actionable error log

The warning now clearly states products will not appear, includes the
count of affected products, and tells the operator exactly how to fix it."
```

---

### Task 3: Handle `product:deleted` webhook by drafting the Medusa product

**Files:**
- Modify: `src/api/webhooks/printify/route.ts`
- Test: `tests/unit/workflows/sync-products.test.ts` (or a new webhook test)

**Step 1: Read the current webhook handler**

Read `src/api/webhooks/printify/route.ts` and locate the `product:deleted` handler. Currently it only sets `is_published = false` on the staging record.

**Step 2: Add Medusa product status update for `product:deleted`**

After setting `is_published = false` on the staging record, also find the linked Medusa product and set its status to `"draft"`:

```typescript
// Inside the product:deleted handler, after updating staging record:
try {
  const { data } = await query.graph({
    entity: "printify_product",
    fields: ["product.id"],
    filters: { printify_id: String(payload.id) },
  })
  if (data.length > 0 && data[0].product?.id) {
    const productModuleService = container.resolve<IProductModuleService>(Modules.PRODUCT)
    await productModuleService.updateProducts(data[0].product.id, { status: "draft" })
    logger.info(`[printify] Drafted Medusa product ${data[0].product.id} after Printify deletion`)
  }
} catch {
  // Link not found or update failed — staging record is already unpublished
}
```

**Step 3: Run tests**

Run: `cd /Users/dcblackhouse/Code/ecommerce/medusa-plugin-printify && npx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/api/webhooks/printify/route.ts
git commit -m "fix: draft Medusa product when Printify product is deleted

Previously the product:deleted webhook only updated the staging record,
leaving the Medusa product published and visible on the storefront."
```

---

### Task 4: Verify the full chain end-to-end

This is a manual verification task against a running Medusa instance.

**Step 1: Check sales channel configuration**

```bash
# List publishable API keys and their sales channels
curl -s http://localhost:9001/admin/api-keys \
  -H "Authorization: Bearer <admin-token>" | jq '.api_keys[] | {id, title, type}'

# For the storefront's publishable key, check associated sales channels
curl -s http://localhost:9001/admin/api-keys/<key-id>?fields=+sales_channels \
  -H "Authorization: Bearer <admin-token>" | jq '.api_key.sales_channels'
```

**Step 2: Check if printify_shop has a sales_channel_id**

```bash
curl -s http://localhost:9001/admin/printify/shops \
  -H "Authorization: Bearer <admin-token>" | jq '.shops[] | {id, printify_id, title, sales_channel_id}'
```

**Step 3: Check if products are assigned to the sales channel**

```bash
# List products via the Store API with the publishable key
curl -s http://localhost:9001/store/products \
  -H "x-publishable-api-key: pk_fd2d72f160f0d499096eb2b029f05277d60eafd9fea491b660a82a9078a97335" | jq '.count'
```

If count is 0, verify the chain: shop sales_channel_id → products linked to that channel → publishable key associated with that channel.

**Step 4: Trigger a re-sync to exercise the fix**

```bash
curl -X POST http://localhost:9001/admin/printify/products \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json"
```

Check logs for the new diagnostic messages. Verify products now appear via the Store API.

---

## Summary of Changes

| File | Change | Why |
|------|--------|-----|
| `src/workflows/sync-products.ts:234-252` | Add `link.create` for sales channel on update path | Products updated by re-sync regain their sales channel link |
| `src/workflows/sync-products.ts:154-167` | Upgrade `logger.warn` to `logger.error` with actionable message | Silent failures become visible and self-documenting |
| `src/api/webhooks/printify/route.ts` | Draft Medusa product on `product:deleted` | Deleted Printify products no longer remain published on storefront |

## Not in Scope (Future)

- Multi-currency pricing (currently hardcoded to USD)
- Single-product webhook sync (currently triggers full shop re-sync)
- Admin UI to reset `visibility_override` back to null
- Handle collision detection on slugified titles
