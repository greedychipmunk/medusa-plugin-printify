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
