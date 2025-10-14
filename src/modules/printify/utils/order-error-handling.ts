/**
 * Enhanced Error Handling for Printify Order Processing
 * 
 * Comprehensive error handling system with specific error types,
 * retry mechanisms, logging, and recovery strategies.
 */

import { PrintifyPluginError, ErrorCode, ErrorSeverity } from './error-handling';
import { logger } from './logger';

export interface OrderErrorContext {
  orderId?: string;
  medusaOrderId?: string;
  printifyOrderId?: string;
  operation: string;
  retryCount?: number;
  originalError?: Error;
  metadata?: Record<string, any>;
}

export enum OrderErrorType {
  VALIDATION_ERROR = 'validation_error',
  API_ERROR = 'api_error',
  NETWORK_ERROR = 'network_error',
  CONFIGURATION_ERROR = 'configuration_error',
  BUSINESS_LOGIC_ERROR = 'business_logic_error',
  TIMEOUT_ERROR = 'timeout_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  PAYMENT_ERROR = 'payment_error',
  INVENTORY_ERROR = 'inventory_error',
  SHIPPING_ERROR = 'shipping_error',
}

export class OrderProcessingError extends PrintifyPluginError {
  public readonly orderContext: OrderErrorContext;
  public readonly errorType: OrderErrorType;
  public readonly retryable: boolean;
  public readonly userFriendly: boolean;

  constructor(
    message: string,
    errorType: OrderErrorType,
    context: OrderErrorContext,
    options: {
      retryable?: boolean;
      userFriendly?: boolean;
      severity?: ErrorSeverity;
      originalError?: Error;
    } = {}
  ) {
    super(
      ErrorCode.UNKNOWN_ERROR, // Use existing error code
      message,
      options.severity || ErrorSeverity.HIGH,
      options.originalError
    );

    this.errorType = errorType;
    this.orderContext = context;
    this.retryable = options.retryable ?? false;
    this.userFriendly = options.userFriendly ?? false;

    // Set error name for better stack traces
    this.name = 'OrderProcessingError';
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    if (!this.userFriendly) {
      return 'An error occurred while processing your order. Please try again later.';
    }

    switch (this.errorType) {
      case OrderErrorType.VALIDATION_ERROR:
        return 'There was an issue with your order information. Please check and try again.';
      case OrderErrorType.INVENTORY_ERROR:
        return 'Some items in your order are no longer available. Please update your cart.';
      case OrderErrorType.PAYMENT_ERROR:
        return 'There was an issue processing payment for this order.';
      case OrderErrorType.SHIPPING_ERROR:
        return 'There was an issue with the shipping information. Please verify your address.';
      case OrderErrorType.RATE_LIMIT_ERROR:
        return 'We are experiencing high demand. Please try again in a few minutes.';
      case OrderErrorType.NETWORK_ERROR:
      case OrderErrorType.TIMEOUT_ERROR:
        return 'Connection issue detected. Please try again.';
      default:
        return 'An unexpected error occurred. Please contact support if this continues.';
    }
  }

  /**
   * Convert to API response format
   */
  toApiResponse() {
    return {
      success: false,
      error: this.errorType,
      message: this.getUserMessage(),
      details: this.userFriendly ? this.message : undefined,
      order_id: this.orderContext.orderId,
      retry_suggested: this.retryable,
      support_code: this.generateSupportCode(),
    };
  }

  /**
   * Generate support code for customer service
   */
  private generateSupportCode(): string {
    const timestamp = Date.now().toString(36);
    const errorTypeCode = this.errorType.substring(0, 3).toUpperCase();
    const orderCode = this.orderContext.orderId?.substring(-4) || 'XXXX';
    return `${errorTypeCode}-${orderCode}-${timestamp}`;
  }
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  retryableErrors: OrderErrorType[];
}

export class OrderErrorHandler {
  private readonly retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      OrderErrorType.NETWORK_ERROR,
      OrderErrorType.TIMEOUT_ERROR,
      OrderErrorType.RATE_LIMIT_ERROR,
      OrderErrorType.API_ERROR,
    ],
  };

  private readonly errorLogger = logger.child('OrderErrorHandler');

  /**
   * Handle order processing error with retry logic
   */
  async handleError<T>(
    operation: () => Promise<T>,
    context: OrderErrorContext,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const finalConfig = { ...this.retryConfig, ...config };
    let lastError: OrderProcessingError | null = null;
    
    for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Log successful retry if this wasn't the first attempt
        if (attempt > 0) {
          this.errorLogger.info('Operation succeeded after retry', {
            operation: context.operation,
            orderId: context.orderId,
            attempt,
            totalRetries: attempt,
          });
        }
        
        return result;
      } catch (error) {
        lastError = this.processError(error, context, attempt);
        
        // Log the error
        this.logError(lastError, attempt, finalConfig.maxRetries);
        
        // Check if we should retry
        if (attempt < finalConfig.maxRetries && this.shouldRetry(lastError, finalConfig)) {
          const delay = this.calculateDelay(attempt, finalConfig);
          
          this.errorLogger.info('Retrying operation after delay', {
            operation: context.operation,
            orderId: context.orderId,
            attempt: attempt + 1,
            delay,
            errorType: lastError.errorType,
          });
          
          await this.sleep(delay);
          continue;
        }
        
        break;
      }
    }

    // All retries exhausted, throw final error
    if (lastError) {
      throw lastError;
    } else {
      throw new OrderProcessingError(
        'Operation failed without specific error',
        OrderErrorType.API_ERROR,
        context
      );
    }
  }

  /**
   * Process raw error into OrderProcessingError
   */
  processError(error: any, context: OrderErrorContext, retryCount: number): OrderProcessingError {
    if (error instanceof OrderProcessingError) {
      return error;
    }

    // Enhanced context with retry information
    const enhancedContext: OrderErrorContext = {
      ...context,
      retryCount,
      originalError: error instanceof Error ? error : new Error(String(error)),
    };

    // Determine error type based on error characteristics
    const errorType = this.classifyError(error);
    const retryable = this.retryConfig.retryableErrors.includes(errorType);
    
    let message = 'Unknown error occurred during order processing';
    let userFriendly = false;
    let severity = ErrorSeverity.HIGH;

    if (error instanceof Error) {
      message = error.message;
      
      // Check for specific error patterns
      if (error.message.includes('timeout')) {
        userFriendly = true;
      } else if (error.message.includes('rate limit')) {
        userFriendly = true;
        severity = ErrorSeverity.MEDIUM;
      } else if (error.message.includes('validation')) {
        userFriendly = true;
      }
    }

    return new OrderProcessingError(message, errorType, enhancedContext, {
      retryable,
      userFriendly,
      severity,
      originalError: error instanceof Error ? error : undefined,
    });
  }

  /**
   * Classify error type based on error characteristics
   */
  private classifyError(error: any): OrderErrorType {
    if (!error) return OrderErrorType.API_ERROR;

    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code || error.status || 0;

    // Network-related errors
    if (errorMessage.includes('network') || errorMessage.includes('connection') || 
        errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND') {
      return OrderErrorType.NETWORK_ERROR;
    }

    // Timeout errors
    if (errorMessage.includes('timeout') || errorCode === 'ETIMEDOUT') {
      return OrderErrorType.TIMEOUT_ERROR;
    }

    // Rate limiting
    if (errorMessage.includes('rate limit') || errorCode === 429) {
      return OrderErrorType.RATE_LIMIT_ERROR;
    }

    // Validation errors
    if (errorMessage.includes('validation') || errorMessage.includes('invalid') ||
        errorCode === 400) {
      return OrderErrorType.VALIDATION_ERROR;
    }

    // Payment errors
    if (errorMessage.includes('payment') || errorMessage.includes('billing')) {
      return OrderErrorType.PAYMENT_ERROR;
    }

    // Inventory errors
    if (errorMessage.includes('inventory') || errorMessage.includes('stock') ||
        errorMessage.includes('unavailable')) {
      return OrderErrorType.INVENTORY_ERROR;
    }

    // Shipping errors
    if (errorMessage.includes('shipping') || errorMessage.includes('address')) {
      return OrderErrorType.SHIPPING_ERROR;
    }

    // Configuration errors
    if (errorMessage.includes('config') || errorMessage.includes('key') ||
        errorCode === 401 || errorCode === 403) {
      return OrderErrorType.CONFIGURATION_ERROR;
    }

    // Default to API error
    return OrderErrorType.API_ERROR;
  }

  /**
   * Check if error should be retried
   */
  private shouldRetry(error: OrderProcessingError, config: RetryConfig): boolean {
    return error.retryable && config.retryableErrors.includes(error.errorType);
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    const delay = Math.min(
      config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
      config.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = delay * 0.1 * Math.random();
    
    return Math.floor(delay + jitter);
  }

  /**
   * Log error with appropriate level and context
   */
  private logError(error: OrderProcessingError, attempt: number, maxRetries: number): void {
    const logContext = {
      errorType: error.errorType,
      operation: error.orderContext.operation,
      orderId: error.orderContext.orderId,
      medusaOrderId: error.orderContext.medusaOrderId,
      printifyOrderId: error.orderContext.printifyOrderId,
      attempt: attempt + 1,
      maxRetries: maxRetries + 1,
      retryable: error.retryable,
      metadata: error.orderContext.metadata,
    };

    if (error.severity === ErrorSeverity.CRITICAL) {
      this.errorLogger.error('Critical order processing error', error.orderContext.originalError, logContext);
    } else if (error.severity === ErrorSeverity.HIGH) {
      this.errorLogger.error('Order processing error', error.orderContext.originalError, logContext);
    } else if (error.severity === ErrorSeverity.MEDIUM) {
      this.errorLogger.warn('Order processing warning', logContext);
    } else {
      this.errorLogger.info('Order processing info', logContext);
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create error context for operation
   */
  createContext(operation: string, orderId?: string, metadata?: Record<string, any>): OrderErrorContext {
    return {
      orderId,
      operation,
      metadata,
    };
  }

  /**
   * Handle multiple errors and aggregate them
   */
  aggregateErrors(errors: OrderProcessingError[], operation: string): OrderProcessingError {
    if (errors.length === 0) {
      return new OrderProcessingError(
        'Unknown error during batch operation',
        OrderErrorType.API_ERROR,
        { operation }
      );
    }

    if (errors.length === 1) {
      return errors[0]!;
    }

    // Create aggregated error
    const errorTypes = [...new Set(errors.map(e => e.errorType))];
    const retryable = errors.some(e => e.retryable);
    const userFriendly = errors.every(e => e.userFriendly);
    
    const message = `Multiple errors occurred during ${operation}: ${errors.map(e => e.message).join('; ')}`;
    const context: OrderErrorContext = {
      operation,
      metadata: {
        errorCount: errors.length,
        errorTypes,
        individualErrors: errors.map(e => ({
          type: e.errorType,
          message: e.message,
          orderId: e.orderContext.orderId,
        })),
      },
    };

    return new OrderProcessingError(message, OrderErrorType.BUSINESS_LOGIC_ERROR, context, {
      retryable,
      userFriendly,
      severity: ErrorSeverity.HIGH,
    });
  }
}