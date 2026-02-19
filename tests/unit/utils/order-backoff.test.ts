/**
 * Unit Tests: Order Backoff Utilities
 */

import {
  calculateBackoffDelay,
  isOrderReadyForRetry,
  DEFAULT_RETRY_BACKOFF_MINUTES,
} from "../../../src/modules/printify/utils/order-utils"

describe("calculateBackoffDelay", () => {
  it("returns 0 for retryCount=0", () => {
    expect(calculateBackoffDelay(0)).toBe(0)
  })

  it("returns base delay for retryCount=1", () => {
    // 5 * 2^0 * 60 * 1000 = 300000 ms = 5 min
    expect(calculateBackoffDelay(1, 5)).toBe(5 * 60 * 1000)
  })

  it("returns doubled delay for retryCount=2", () => {
    // 5 * 2^1 * 60 * 1000 = 600000 ms = 10 min
    expect(calculateBackoffDelay(2, 5)).toBe(10 * 60 * 1000)
  })

  it("returns quadrupled delay for retryCount=3", () => {
    // 5 * 2^2 * 60 * 1000 = 1200000 ms = 20 min
    expect(calculateBackoffDelay(3, 5)).toBe(20 * 60 * 1000)
  })
})

describe("isOrderReadyForRetry", () => {
  it("returns true when retry_count=0", () => {
    const order = { retry_count: 0, last_error_at: null }
    expect(isOrderReadyForRetry(order)).toBe(true)
  })

  it("returns true when enough time has elapsed", () => {
    // retry_count=1, base=5min → delay=5min. Last error was 10 min ago.
    const order = {
      retry_count: 1,
      last_error_at: new Date(Date.now() - 10 * 60 * 1000),
    }
    expect(isOrderReadyForRetry(order, 5)).toBe(true)
  })

  it("returns false when still in backoff window", () => {
    // retry_count=2, base=5min → delay=10min. Last error was 1 min ago.
    const order = {
      retry_count: 2,
      last_error_at: new Date(Date.now() - 1 * 60 * 1000),
    }
    expect(isOrderReadyForRetry(order, 5)).toBe(false)
  })

  it("returns true when last_error_at is missing", () => {
    const order = { retry_count: 2, last_error_at: null }
    expect(isOrderReadyForRetry(order)).toBe(true)
  })

  it("reads from entity nested fields", () => {
    const order = {
      entity: {
        retry_count: 1,
        last_error_at: new Date(Date.now() - 1 * 60 * 1000),
      },
    }
    // retry_count=1, base=5min → delay=5min. Last error was 1 min ago → not ready
    expect(isOrderReadyForRetry(order, 5)).toBe(false)
  })

  it("handles string date for last_error_at", () => {
    const order = {
      retry_count: 1,
      last_error_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }
    expect(isOrderReadyForRetry(order, 5)).toBe(true)
  })
})
