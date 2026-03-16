# Printify Product Management — Design

**Date:** 2026-03-12
**Scope:** Browse & sync controls with product detail view

## Navigation Flow

```
/printify (shops list)
   └── Click shop row → /printify/products?shop_id=<printify_id>
         └── Click product row → /printify/products/[id] (detail page)
```

## 1. Shops Page Changes (`/printify`)

- Make each shop row clickable — navigates to `/printify/products?shop_id={shop.printify_id}`
- Add a subtle arrow or "Products" column indicating navigability
- Keep existing Sync Shops button

## 2. Products Page Changes (`/printify/products`)

- Read `shop_id` from URL query params and pass to the API
- Show a breadcrumb: Printify > Shop Name > Products
- Keep existing search filter and Sync Products button
- Make product rows clickable → navigate to `/printify/products/{product.id}`
- Add an image thumbnail column (first image from `images` array)
- Show variant count and published status (existing)
- Sync button sends `shop_id` to the POST endpoint

## 3. New Product Detail Page (`/printify/products/[id]`)

- **Header**: Product title, published badge, "View on Printify" external link
- **Image gallery**: Grid of product images from the `images` JSON field
- **Variants table**: Title, SKU, Cost (formatted $), Price, Enabled status
- **Linked Medusa product**: Query link table, show linked product name with nav link to `/products/{medusa_product_id}`, or "Not linked"
- **Raw JSON section**: Collapsible block showing `printify_data` formatted as JSON

## 4. Backend Changes

- **New API route**: `GET /admin/printify/products/[id]` — single product by internal ID, includes linked Medusa product ID from link module
- **Fix sync `is_published`**: Map from Printify API data so the badge is meaningful

## 5. Out of Scope

- No CRUD operations on Printify (no create/edit/delete from admin)
- No bulk operations
- No data model changes
- No webhook or sync workflow changes (beyond `is_published` fix)
