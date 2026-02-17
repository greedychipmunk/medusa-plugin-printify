import crypto from "crypto"
import type { PrintifyShippingOption } from "../services/printify-api-client"

interface CacheEntry {
  rates: PrintifyShippingOption[]
  expiresAt: number
}

export class ShippingRateCache {
  private cache = new Map<string, CacheEntry>()
  private ttlMs: number
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(ttlMinutes: number = 15) {
    this.ttlMs = ttlMinutes * 60 * 1000
    this.startCleanup()
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of this.cache) {
        if (entry.expiresAt <= now) {
          this.cache.delete(key)
        }
      }
    }, 5 * 60 * 1000) // every 5 minutes

    // Allow process to exit without waiting for this timer
    if (this.cleanupTimer && typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref()
    }
  }

  buildKey(
    lineItems: Array<{ product_id: string; variant_id: number; quantity: number }>,
    address: { country_code: string; zip: string; city: string; state_code?: string },
  ): string {
    const sortedItems = [...lineItems]
      .sort((a, b) => {
        if (a.product_id !== b.product_id) return a.product_id.localeCompare(b.product_id)
        return a.variant_id - b.variant_id
      })
      .map((i) => `${i.product_id}:${i.variant_id}:${i.quantity}`)

    const addressKey = [
      address.country_code,
      address.zip,
      address.city,
      address.state_code || "",
    ].join("|")

    const raw = `${sortedItems.join(",")}::${addressKey}`
    return crypto.createHash("sha256").update(raw).digest("hex")
  }

  get(
    lineItems: Array<{ product_id: string; variant_id: number; quantity: number }>,
    address: { country_code: string; zip: string; city: string; state_code?: string },
  ): PrintifyShippingOption[] | null {
    const key = this.buildKey(lineItems, address)
    const entry = this.cache.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key)
      return null
    }
    return entry.rates
  }

  set(
    lineItems: Array<{ product_id: string; variant_id: number; quantity: number }>,
    address: { country_code: string; zip: string; city: string; state_code?: string },
    rates: PrintifyShippingOption[],
  ): void {
    const key = this.buildKey(lineItems, address)
    this.cache.set(key, {
      rates,
      expiresAt: Date.now() + this.ttlMs,
    })
  }

  clear(): void {
    this.cache.clear()
  }

  getStats(): { size: number; ttlMs: number } {
    return { size: this.cache.size, ttlMs: this.ttlMs }
  }
}

export const shippingRateCache = new ShippingRateCache()
