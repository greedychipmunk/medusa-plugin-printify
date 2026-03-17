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
      expect(convertPrice(19.99, "usd", rates)).toBe(19.99)
    })

    it("converts usd amount to target currency using rate", () => {
      // 19.99 * 0.92 = 18.3908 → 18.39
      expect(convertPrice(19.99, "eur", rates)).toBe(18.39)
    })

    it("rounds to 2 decimal places", () => {
      // 19.99 * 6.85 = 136.9315 → 136.93
      expect(convertPrice(19.99, "dkk", rates)).toBe(136.93)
    })

    it("throws for unknown currency", () => {
      expect(() => convertPrice(19.99, "gbp", rates)).toThrow(
        "No exchange rate for gbp"
      )
    })
  })
})
