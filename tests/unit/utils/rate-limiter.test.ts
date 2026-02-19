/**
 * Unit Tests: RateLimiter
 *
 * Tests for rate limit state tracking, retry delay calculation, and retry gating.
 */

import { RateLimiter } from "../../../src/modules/printify/utils/rate-limiter"

describe("RateLimiter", () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter(3)
  })

  // 1. Initial state is all undefined
  it("should return undefined state initially", () => {
    const info = limiter.getRateLimitInfo()
    expect(info).toEqual({ limit: undefined, remaining: undefined, resetAt: undefined })
  })

  // 2. updateFromHeaders parses standard rate limit headers
  it("should parse rate limit headers", () => {
    limiter.updateFromHeaders({
      "x-ratelimit-limit": "100",
      "x-ratelimit-remaining": "42",
      "x-ratelimit-reset": "1700000000",
    })

    const info = limiter.getRateLimitInfo()
    expect(info.limit).toBe(100)
    expect(info.remaining).toBe(42)
    expect(info.resetAt).toBe(1700000000000) // seconds → ms
  })

  // 3. updateFromHeaders handles partial headers
  it("should handle partial headers without overwriting existing state", () => {
    limiter.updateFromHeaders({ "x-ratelimit-limit": "200" })

    const info = limiter.getRateLimitInfo()
    expect(info.limit).toBe(200)
    expect(info.remaining).toBeUndefined()
    expect(info.resetAt).toBeUndefined()
  })

  // 4. getRateLimitInfo returns a copy, not a reference
  it("should return a copy of state", () => {
    limiter.updateFromHeaders({ "x-ratelimit-remaining": "10" })
    const info = limiter.getRateLimitInfo()
    info.remaining = 999

    expect(limiter.getRateLimitInfo().remaining).toBe(10)
  })

  // 5. getRetryDelay uses Retry-After header when present
  it("should use Retry-After header for delay", () => {
    const delay = limiter.getRetryDelay(1, "5")
    expect(delay).toBe(5000)
  })

  // 6. getRetryDelay uses exponential backoff when no header
  it("should use exponential backoff without Retry-After header", () => {
    // retryCount=1 → base 2000ms, retryCount=2 → base 4000ms
    const delay1 = limiter.getRetryDelay(1)
    const delay2 = limiter.getRetryDelay(2)

    // With 10% jitter, delay1 should be between 2000 and 2200
    expect(delay1).toBeGreaterThanOrEqual(2000)
    expect(delay1).toBeLessThanOrEqual(2200)

    // delay2 should be between 4000 and 4400
    expect(delay2).toBeGreaterThanOrEqual(4000)
    expect(delay2).toBeLessThanOrEqual(4400)
  })

  // 7. getRetryDelay caps at 30 seconds
  it("should cap delay at 30 seconds", () => {
    const delay = limiter.getRetryDelay(10) // 2^10 * 1000 = 1024000 → capped to 30000
    expect(delay).toBeGreaterThanOrEqual(30000)
    expect(delay).toBeLessThanOrEqual(33000) // 30000 + 10% jitter
  })

  // 8. getRetryDelay applies jitter
  it("should apply jitter to backoff delays", () => {
    const delays = new Set<number>()
    for (let i = 0; i < 20; i++) {
      delays.add(limiter.getRetryDelay(2))
    }
    // With jitter, we should get at least a few distinct values
    expect(delays.size).toBeGreaterThan(1)
  })

  // 9. shouldRetry returns true when under max
  it("should allow retries under the max", () => {
    expect(limiter.shouldRetry(0)).toBe(true)
    expect(limiter.shouldRetry(1)).toBe(true)
    expect(limiter.shouldRetry(2)).toBe(true)
  })

  // 10. shouldRetry returns false when at or over max
  it("should deny retries at or over the max", () => {
    expect(limiter.shouldRetry(3)).toBe(false)
    expect(limiter.shouldRetry(4)).toBe(false)
  })

  // 11. Custom maxRetries
  it("should respect custom maxRetries", () => {
    const customLimiter = new RateLimiter(1)
    expect(customLimiter.shouldRetry(0)).toBe(true)
    expect(customLimiter.shouldRetry(1)).toBe(false)
  })

  // 12. getRetryDelay handles fractional Retry-After
  it("should handle fractional Retry-After values", () => {
    const delay = limiter.getRetryDelay(1, "2.5")
    expect(delay).toBe(2500)
  })
})
