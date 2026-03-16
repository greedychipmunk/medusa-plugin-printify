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
      expect(convertPrice(1000, "eur", rates)).toBe(920)
    })

    it("rounds to nearest integer", () => {
      expect(convertPrice(999, "dkk", rates)).toBe(6843)
    })

    it("throws for unknown currency", () => {
      expect(() => convertPrice(1000, "gbp", rates)).toThrow(
        "No exchange rate for gbp"
      )
    })
  })
})
