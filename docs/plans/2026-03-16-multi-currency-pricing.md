# Multi-Currency Pricing for Printify Product Sync

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert Printify's USD-only variant prices into multi-currency prices for all active Medusa regions during product sync, using live exchange rates.

**Architecture:** Extract a `currency-converter` utility that fetches rates from the Frankfurter API (free, ECB-backed, no API key). During sync, query all active Medusa regions for their currency codes, convert the Printify USD price to each currency, and pass the full `prices[]` array to `createProductsWorkflow` / `updateProducts`. Rates are cached per sync run (not per-product) to avoid redundant HTTP calls.

**Tech Stack:** Axios (already a dependency), Frankfurter API (`api.frankfurter.dev`), Medusa Region Module (`Modules.REGION`), Jest

---

## Task 1: Create the currency converter utility

**Files:**
- Create: `src/utils/currency-converter.ts`
- Test: `tests/unit/utils/currency-converter.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/unit/utils/currency-converter.test.ts
import axios from "axios"
import { fetchExchangeRates, convertPrice } from "../../../src/utils/currency-converter"

jest.mock("axios")
const mockedAxios = axios as jest.Mocked<typeof axios>

describe("currency-converter", () => {
  describe("fetchExchangeRates", () => {
    it("fetches rates from Frankfurter API for given currencies", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { base: "USD", rates: { EUR: 0.92, DKK: 6.85 } },
      })

      const rates = await fetchExchangeRates(["eur", "dkk"])

      expect(mockedAxios.get).toHaveBeenCalledWith(
        "https://api.frankfurter.dev/v1/latest",
        { params: { base: "USD", symbols: "EUR,DKK" }, timeout: 10000 }
      )
      expect(rates).toEqual({ eur: 0.92, dkk: 6.85 })
    })

    it("returns empty object when only currency is usd", async () => {
      const rates = await fetchExchangeRates(["usd"])
      expect(mockedAxios.get).not.toHaveBeenCalled()
      expect(rates).toEqual({})
    })

    it("throws on API failure", async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error("Network error"))
      await expect(fetchExchangeRates(["eur"])).rejects.toThrow(
        "Failed to fetch exchange rates"
      )
    })
  })

  describe("convertPrice", () => {
    const rates = { eur: 0.92, dkk: 6.85 }

    it("returns the original amount for usd", () => {
      expect(convertPrice(1000, "usd", rates)).toBe(1000)
    })

    it("converts usd amount to target currency using rate", () => {
      // 1000 cents USD * 0.92 = 920 cents EUR
      expect(convertPrice(1000, "eur", rates)).toBe(920)
    })

    it("rounds to nearest integer", () => {
      // 999 cents USD * 6.85 = 6843.15 → 6843
      expect(convertPrice(999, "dkk", rates)).toBe(6843)
    })

    it("throws for unknown currency", () => {
      expect(() => convertPrice(1000, "gbp", rates)).toThrow(
        "No exchange rate for gbp"
      )
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/dcblackhouse/Code/ecommerce/medusa-plugin-printify && npx jest tests/unit/utils/currency-converter.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/utils/currency-converter.ts
import axios from "axios"

export type ExchangeRates = Record<string, number>

/**
 * Fetches latest exchange rates from USD to the given currency codes
 * using the Frankfurter API (free, ECB-backed, no API key needed).
 * Returns a map of lowercase currency_code → rate relative to USD.
 */
export async function fetchExchangeRates(
  currencyCodes: string[]
): Promise<ExchangeRates> {
  const nonUsd = currencyCodes
    .map((c) => c.toLowerCase())
    .filter((c) => c !== "usd")

  if (nonUsd.length === 0) return {}

  try {
    const symbols = nonUsd.map((c) => c.toUpperCase()).join(",")
    const { data } = await axios.get(
      "https://api.frankfurter.dev/v1/latest",
      { params: { base: "USD", symbols }, timeout: 10000 }
    )
    const rates: ExchangeRates = {}
    for (const [code, rate] of Object.entries(data.rates)) {
      rates[code.toLowerCase()] = rate as number
    }
    return rates
  } catch (err) {
    throw new Error(
      `Failed to fetch exchange rates: ${err instanceof Error ? err.message : err}`
    )
  }
}

/**
 * Converts a price in USD cents to the target currency using the given rates.
 * Returns the converted amount as an integer (rounded).
 */
export function convertPrice(
  amountInUsdCents: number,
  targetCurrency: string,
  rates: ExchangeRates
): number {
  const currency = targetCurrency.toLowerCase()
  if (currency === "usd") return amountInUsdCents
  const rate = rates[currency]
  if (rate == null) throw new Error(`No exchange rate for ${currency}`)
  return Math.round(amountInUsdCents * rate)
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/dcblackhouse/Code/ecommerce/medusa-plugin-printify && npx jest tests/unit/utils/currency-converter.test.ts`
Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add src/utils/currency-converter.ts tests/unit/utils/currency-converter.test.ts
git commit -m "feat: add currency converter utility with Frankfurter API"
```

---

## Task 2: Create a helper to build multi-currency prices

This extracts the price-building logic from `buildMedusaVariants` into a testable function.

**Files:**
- Create: `src/utils/build-variant-prices.ts`
- Test: `tests/unit/utils/build-variant-prices.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/unit/utils/build-variant-prices.test.ts
import { buildVariantPrices } from "../../../src/utils/build-variant-prices"
import type { ExchangeRates } from "../../../src/utils/currency-converter"

describe("buildVariantPrices", () => {
  const rates: ExchangeRates = { eur: 0.92, dkk: 6.85 }
  const currencies = ["usd", "eur", "dkk"]

  it("creates a price entry for each currency", () => {
    const prices = buildVariantPrices(1000, currencies, rates)
    expect(prices).toEqual([
      { amount: 1000, currency_code: "usd" },
      { amount: 920, currency_code: "eur" },
      { amount: 6850, currency_code: "dkk" },
    ])
  })

  it("returns only usd when no other currencies exist", () => {
    const prices = buildVariantPrices(1000, ["usd"], {})
    expect(prices).toEqual([{ amount: 1000, currency_code: "usd" }])
  })

  it("handles zero price", () => {
    const prices = buildVariantPrices(0, currencies, rates)
    expect(prices).toEqual([
      { amount: 0, currency_code: "usd" },
      { amount: 0, currency_code: "eur" },
      { amount: 0, currency_code: "dkk" },
    ])
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/dcblackhouse/Code/ecommerce/medusa-plugin-printify && npx jest tests/unit/utils/build-variant-prices.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/utils/build-variant-prices.ts
import { convertPrice, type ExchangeRates } from "./currency-converter"

/**
 * Builds a Medusa-compatible prices array for a variant,
 * converting the Printify USD price to all active currencies.
 */
export function buildVariantPrices(
  printifyPriceUsdCents: number,
  currencies: string[],
  rates: ExchangeRates
): { amount: number; currency_code: string }[] {
  return currencies.map((currency) => ({
    amount: convertPrice(printifyPriceUsdCents, currency, rates),
    currency_code: currency,
  }))
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/dcblackhouse/Code/ecommerce/medusa-plugin-printify && npx jest tests/unit/utils/build-variant-prices.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/utils/build-variant-prices.ts tests/unit/utils/build-variant-prices.test.ts
git commit -m "feat: add buildVariantPrices helper for multi-currency support"
```

---

## Task 3: Integrate multi-currency pricing into sync workflow

**Files:**
- Modify: `src/workflows/sync-products.ts` (lines 1-12 imports, 92-116 buildMedusaVariants, 174-182 createMedusaProductsStep setup, 270 + 304 call sites)
- Modify: `tests/unit/workflows/sync-products.test.ts`

**Step 1: Update the test to verify multi-currency behavior**

Add these tests to the existing `sync-products.test.ts`:

```typescript
// Add to existing describe block in tests/unit/workflows/sync-products.test.ts

  it("imports fetchExchangeRates from currency-converter", () => {
    expect(source).toContain("fetchExchangeRates")
  })

  it("imports buildVariantPrices from build-variant-prices", () => {
    expect(source).toContain("buildVariantPrices")
  })

  it("queries Medusa regions for currency codes", () => {
    expect(source).toContain("Modules.REGION")
    expect(source).toContain("listRegions")
  })

  it("passes currencies and rates to buildMedusaVariants", () => {
    // buildMedusaVariants should accept currencies and rates params
    const fnSignature = source.substring(
      source.indexOf("function buildMedusaVariants"),
      source.indexOf("{", source.indexOf("function buildMedusaVariants"))
    )
    expect(fnSignature).toContain("currencies")
    expect(fnSignature).toContain("rates")
  })

  it("no longer hardcodes usd currency_code", () => {
    // The old hardcoded price should be replaced by buildVariantPrices
    expect(source).not.toContain('currency_code: "usd"')
  })
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/dcblackhouse/Code/ecommerce/medusa-plugin-printify && npx jest tests/unit/workflows/sync-products.test.ts`
Expected: FAIL — source still contains hardcoded `"usd"`, missing imports

**Step 3: Modify `sync-products.ts`**

**3a. Add imports** (top of file, after existing imports):

```typescript
import { fetchExchangeRates, type ExchangeRates } from "../utils/currency-converter"
import { buildVariantPrices } from "../utils/build-variant-prices"
```

**3b. Update `buildMedusaVariants` signature and body** (replace lines 92-116):

```typescript
function buildMedusaVariants(
  enabledVariants: PrintifyVariant[],
  mapped: NonNullable<ReturnType<typeof mapPrintifyOptions>>,
  printifyProductId: string,
  currencies: string[],
  rates: ExchangeRates
) {
  return enabledVariants.map((v) => ({
    title: v.title,
    sku: v.sku || undefined,
    options: mapped.variantOptionMap.get(v.id) ?? {},
    prices: buildVariantPrices(v.price, currencies, rates),
    manage_inventory: false,
    metadata: {
      printify_variant_id: v.id,
      printify_product_id: printifyProductId,
    },
  }))
}
```

**3c. In `createMedusaProductsStep`, after resolving `salesChannelId` and before the product loop** (around line 226, after the `if (!salesChannelId)` block):

```typescript
    // Fetch all unique currencies from active regions
    const regionModule = container.resolve(Modules.REGION)
    const regions = await regionModule.listRegions({})
    const currencies = [...new Set(regions.map((r) => r.currency_code))]

    // Always include usd (Printify's base currency)
    if (!currencies.includes("usd")) {
      currencies.unshift("usd")
    }

    // Fetch exchange rates once for all products in this sync
    let rates: ExchangeRates = {}
    try {
      rates = await fetchExchangeRates(currencies)
      logger.info(`[printify] Fetched exchange rates for ${currencies.join(", ")}`)
    } catch (err) {
      logger.warn(
        `[printify] Could not fetch exchange rates — falling back to USD only: ${
          err instanceof Error ? err.message : err
        }`
      )
      // Fallback: only USD prices (prevents crash, but non-USD regions will still fail)
      // This is a degraded state — log a warning so it's visible
    }

    // If rates fetch failed, only create USD prices
    const activeCurrencies = Object.keys(rates).length > 0
      ? currencies
      : ["usd"]
```

**3d. Update both call sites** to pass `activeCurrencies` and `rates`:

At the create path (around line 270):
```typescript
variants: buildMedusaVariants(enabledVariants, mapped, pp.printify_id, activeCurrencies, rates),
```

At the update path (around line 304):
```typescript
variants: buildMedusaVariants(enabledVariants, mapped, pp.printify_id, activeCurrencies, rates),
```

**Step 4: Run all tests**

Run: `cd /Users/dcblackhouse/Code/ecommerce/medusa-plugin-printify && npx jest`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/workflows/sync-products.ts tests/unit/workflows/sync-products.test.ts
git commit -m "feat: sync Printify products with multi-currency pricing via exchange rates"
```

---

## Task 4: Re-sync products and verify the fix

This is a manual verification task — no code changes.

**Step 1: Build the plugin**

Run: `cd /Users/dcblackhouse/Code/ecommerce/medusa-plugin-printify && pnpm build`
Expected: Build succeeds

**Step 2: Deploy to Medusa container**

Follow the existing plugin deploy process (docker cp into container per feedback memory).

**Step 3: Trigger a product re-sync**

Via the Medusa admin UI or API — trigger a Printify product sync for your shop.

**Step 4: Verify in Medusa Admin**

- Open a synced product in Medusa Admin
- Check that each variant now has prices for ALL region currencies (USD, DKK, EUR, etc.)
- Verify the converted amounts look reasonable

**Step 5: Test add-to-cart on storefront**

- Navigate to a product page on the storefront (e.g., `http://localhost:8000/dk/products/...`)
- Select a variant and click "Add to cart"
- Expected: No 500 error — item is added to cart successfully
- Check the cart shows the correct currency-converted price

**Step 6: Remove diagnostic logging from storefront**

After confirming the fix works, revert the temporary diagnostic logging added earlier in `src/lib/data/cart.ts` (the try/catch wrapper around `getOrSetCart` and the enhanced `.catch` on `createLineItem`). The `medusa-error.ts` FetchError fix should stay — that's a permanent improvement.

---

## Notes

- **Exchange rate accuracy:** Frankfurter API uses ECB reference rates, updated daily. Prices will be approximate. Store owners can fine-tune prices in Medusa Admin after sync.
- **Fallback behavior:** If the exchange rate API is down, sync continues with USD-only prices and logs a warning. This prevents sync failures but means non-USD regions will still crash on add-to-cart until the next successful sync.
- **Future enhancement:** Consider caching exchange rates in a Medusa custom model or environment variable to survive API outages, or allow store owners to set manual exchange rates.
