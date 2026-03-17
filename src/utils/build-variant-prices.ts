import { convertPrice, type ExchangeRates } from "./currency-converter"

/**
 * Builds a Medusa-compatible prices array for a variant,
 * converting the Printify USD price (in cents) to all active currencies.
 * Medusa stores amounts in major currency units (e.g. 19.99 = $19.99).
 */
export function buildVariantPrices(
  printifyPriceUsdCents: number,
  currencies: string[],
  rates: ExchangeRates
): { amount: number; currency_code: string }[] {
  const priceInDollars = printifyPriceUsdCents / 100
  return currencies.map((currency) => ({
    amount: convertPrice(priceInDollars, currency, rates),
    currency_code: currency,
  }))
}
