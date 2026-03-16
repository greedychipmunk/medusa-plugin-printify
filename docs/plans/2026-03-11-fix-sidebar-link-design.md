# Fix Printify Admin Sidebar Link — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the "Printify" link appear in the Medusa admin sidebar by replacing the null icon with a real one.

**Architecture:** The `defineRouteConfig` in `page.tsx` currently passes `icon: () => null`, which causes the admin shell to skip rendering the sidebar item. Replacing it with `BuildingStorefront` from `@medusajs/icons` fixes this.

**Tech Stack:** Medusa Admin SDK, @medusajs/icons

---

### Task 1: Fix the icon in defineRouteConfig

**Files:**
- Modify: `src/admin/routes/printify/page.tsx:1,60-63`

**Step 1: Add the icon import**

Add this import to line 1 area of the file:

```tsx
import { BuildingStorefront } from "@medusajs/icons"
```

**Step 2: Replace the icon config**

Change line 62 from:

```tsx
icon: () => null,
```

To:

```tsx
icon: BuildingStorefront,
```

**Step 3: Build the plugin**

Run: `npx medusa build`
Expected: Build succeeds with no errors

**Step 4: Verify the compiled output includes the icon**

Run: `grep -c "BuildingStorefront" .medusa/server/src/admin/index.mjs`
Expected: At least 1 match, confirming the icon is bundled

**Step 5: Commit**

```bash
git add src/admin/routes/printify/page.tsx
git commit -m "fix: add BuildingStorefront icon to sidebar nav so link renders"
```

---

### Verification (manual)

1. Install the plugin in a Medusa app (or link it locally)
2. Confirm the plugin is registered in the app's `medusa-config.ts`
3. Start the dev server (`npx medusa develop`)
4. Open http://localhost:9000/app — "Printify" should appear in the sidebar with a storefront icon
5. Click it — should navigate to the Printify shops page
