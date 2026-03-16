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
