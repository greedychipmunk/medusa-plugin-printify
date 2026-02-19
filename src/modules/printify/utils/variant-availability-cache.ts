import crypto from "crypto"

export interface CachedVariant {
  id: number
  title: string
  sku: string
  price: number
  compare_at_price: number
  options: Record<string, string>
  is_available: boolean
  is_enabled: boolean
  images: string[]
}

interface CacheEntry {
  variants: CachedVariant[]
  fetchedAt: Date
  expiresAt: number
}

export class VariantAvailabilityCache {
  private cache = new Map<string, CacheEntry>()
  private ttlMs: number
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(ttlMinutes: number = 5) {
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
    }, 5 * 60 * 1000)

    if (this.cleanupTimer && typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref()
    }
  }

  buildKey(productId: string): string {
    return crypto.createHash("sha256").update(productId).digest("hex")
  }

  get(productId: string): { variants: CachedVariant[]; fetchedAt: Date } | null {
    const key = this.buildKey(productId)
    const entry = this.cache.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key)
      return null
    }
    return { variants: entry.variants, fetchedAt: entry.fetchedAt }
  }

  set(productId: string, variants: CachedVariant[]): void {
    const key = this.buildKey(productId)
    this.cache.set(key, {
      variants,
      fetchedAt: new Date(),
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

export const variantAvailabilityCache = new VariantAvailabilityCache()
