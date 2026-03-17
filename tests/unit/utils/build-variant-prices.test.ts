import { buildVariantPrices } from "../../../src/utils/build-variant-prices"
import type { ExchangeRates } from "../../../src/utils/currency-converter"

describe("buildVariantPrices", () => {
  const rates: ExchangeRates = { eur: 0.92, dkk: 6.85 }
  const currencies = ["usd", "eur", "dkk"]

  it("converts cents to dollars and creates a price entry for each currency", () => {
    // 1999 cents = $19.99
    const prices = buildVariantPrices(1999, currencies, rates)
    expect(prices).toEqual([
      { amount: 19.99, currency_code: "usd" },
      { amount: 18.39, currency_code: "eur" },   // 19.99 * 0.92
      { amount: 136.93, currency_code: "dkk" },   // 19.99 * 6.85
    ])
  })

  it("returns only usd when no other currencies exist", () => {
    const prices = buildVariantPrices(1999, ["usd"], {})
    expect(prices).toEqual([{ amount: 19.99, currency_code: "usd" }])
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
