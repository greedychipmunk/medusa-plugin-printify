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
