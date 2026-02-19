/**
 * Error Handling Utilities
 * 
 * Provides standardized error handling, logging, and error classification
 * for the Printify plugin.
 */

export enum ErrorCode {
  // Configuration Errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_API_KEY = 'MISSING_API_KEY',
  MISSING_SHOP_ID = 'MISSING_SHOP_ID',

  // API Errors
  API_CONNECTION_FAILED = 'API_CONNECTION_FAILED',
  API_RATE_LIMITED = 'API_RATE_LIMITED',
  API_UNAUTHORIZED = 'API_UNAUTHORIZED',
  API_NOT_FOUND = 'API_NOT_FOUND',
  API_SERVER_ERROR = 'API_SERVER_ERROR',

  // Product Errors
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  PRODUCT_ALREADY_EXISTS = 'PRODUCT_ALREADY_EXISTS',
  PRODUCT_SYNC_FAILED = 'PRODUCT_SYNC_FAILED',

  // Database Errors
  DATABASE_CONNECTION_FAILED = 'DATABASE_CONNECTION_FAILED',
  DATABASE_QUERY_FAILED = 'DATABASE_QUERY_FAILED',
  ENTITY_NOT_FOUND = 'ENTITY_NOT_FOUND',

  // Webhook Errors
  WEBHOOK_VERIFICATION_FAILED = 'WEBHOOK_VERIFICATION_FAILED',
  WEBHOOK_PROCESSING_FAILED = 'WEBHOOK_PROCESSING_FAILED',

  // General Errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorContext {
  [key: string]: any;
}

export interface PrintifyError {
  code: ErrorCode;
  message: string;
  severity: ErrorSeverity;
  context?: ErrorContext;
  originalError?: Error;
  timestamp: Date;
  stack?: string;
}

/**
 * Custom error class for Printify plugin
 */
export class PrintifyPluginError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly context?: ErrorContext;
  public readonly originalError?: Error;
  public readonly timestamp: Date;

  constructor(
    code: ErrorCode,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: ErrorContext,
    originalError?: Error
  ) {
    super(message);
    this.name = 'PrintifyPluginError';
    this.code = code;
    this.severity = severity;
    this.context = context;
    this.originalError = originalError;
    this.timestamp = new Date();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PrintifyPluginError);
    }
  }

  /**
   * Convert to plain object for logging/serialization
   */
  toObject(): PrintifyError {
    return {
      code: this.code,
      message: this.message,
      severity: this.severity,
      context: this.context,
      originalError: this.originalError,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    const retryableCodes = [
      ErrorCode.API_CONNECTION_FAILED,
      ErrorCode.API_RATE_LIMITED,
      ErrorCode.API_SERVER_ERROR,
      ErrorCode.DATABASE_CONNECTION_FAILED,
    ];

    return retryableCodes.includes(this.code);
  }

  /**
   * Check if error is critical and requires immediate attention
   */
  isCritical(): boolean {
    return this.severity === ErrorSeverity.CRITICAL;
  }
}

/**
 * Error factory functions for common error scenarios
 */
export class ErrorFactory {
  /**
   * Create configuration error
   */
  static configError(message: string, context?: ErrorContext): PrintifyPluginError {
    return new PrintifyPluginError(
      ErrorCode.INVALID_CONFIG,
      message,
      ErrorSeverity.HIGH,
      context
    );
  }

  /**
   * Create API error
   */
  static apiError(
    code: ErrorCode,
    message: string,
    originalError?: Error,
    context?: ErrorContext
  ): PrintifyPluginError {
    const severity = code === ErrorCode.API_RATE_LIMITED 
      ? ErrorSeverity.MEDIUM 
      : ErrorSeverity.HIGH;

    return new PrintifyPluginError(code, message, severity, context, originalError);
  }

  /**
   * Create product error
   */
  static productError(message: string, context?: ErrorContext): PrintifyPluginError {
    return new PrintifyPluginError(
      ErrorCode.PRODUCT_SYNC_FAILED,
      message,
      ErrorSeverity.MEDIUM,
      context
    );
  }

  /**
   * Create database error
   */
  static databaseError(message: string, originalError?: Error): PrintifyPluginError {
    return new PrintifyPluginError(
      ErrorCode.DATABASE_QUERY_FAILED,
      message,
      ErrorSeverity.HIGH,
      undefined,
      originalError
    );
  }

  /**
   * Create webhook error
   */
  static webhookError(message: string, context?: ErrorContext): PrintifyPluginError {
    return new PrintifyPluginError(
      ErrorCode.WEBHOOK_PROCESSING_FAILED,
      message,
      ErrorSeverity.MEDIUM,
      context
    );
  }

  /**
   * Create unknown error
   */
  static unknownError(message: string, originalError?: Error): PrintifyPluginError {
    return new PrintifyPluginError(
      ErrorCode.UNKNOWN_ERROR,
      message,
      ErrorSeverity.MEDIUM,
      undefined,
      originalError
    );
  }
}

/**
 * Retry utilities for handling transient errors
 */
export class RetryUtil {
  /**
   * Execute function with exponential backoff retry
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000,
    maxDelayMs: number = 10000,
    logger?: { warn: (message: string) => void }
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (error instanceof PrintifyPluginError && !error.isRetryable()) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        
        const msg = `Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${(error as Error).message}`;
        if (logger) {
          logger.warn(msg);
        } else {
          console.warn(msg);
        }
        
        await this.delay(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Sleep for specified milliseconds
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Async error handler for wrapping promises
 */
export function handleAsync<T>(promise: Promise<T>): Promise<[Error | null, T | null]> {
  return promise
    .then<[null, T]>((data: T) => [null, data])
    .catch<[Error, null]>((error: Error) => [error, null]);
}