export interface RateLimitState {
  limit: number | undefined
  remaining: number | undefined
  resetAt: number | undefined // epoch ms
}

export class RateLimiter {
  private state: RateLimitState = { limit: undefined, remaining: undefined, resetAt: undefined }
  private maxRetries: number

  constructor(maxRetries: number = 3) {
    this.maxRetries = maxRetries
  }

  updateFromHeaders(headers: Record<string, string>): void {
    const limit = headers["x-ratelimit-limit"]
    const remaining = headers["x-ratelimit-remaining"]
    const reset = headers["x-ratelimit-reset"]

    if (limit !== undefined) {
      this.state.limit = parseInt(limit, 10)
    }
    if (remaining !== undefined) {
      this.state.remaining = parseInt(remaining, 10)
    }
    if (reset !== undefined) {
      this.state.resetAt = parseInt(reset, 10) * 1000 // seconds → ms
    }
  }

  getRateLimitInfo(): RateLimitState {
    return { ...this.state }
  }

  getRetryDelay(retryCount: number, retryAfterHeader?: string): number {
    if (retryAfterHeader) {
      const seconds = parseFloat(retryAfterHeader)
      if (!isNaN(seconds)) {
        return Math.ceil(seconds * 1000)
      }
    }

    const baseDelay = 1000 * Math.pow(2, retryCount)
    const capped = Math.min(baseDelay, 30000)
    const jitter = capped * 0.1 * Math.random()
    return Math.ceil(capped + jitter)
  }

  shouldRetry(retryCount: number): boolean {
    return retryCount < this.maxRetries
  }
}
