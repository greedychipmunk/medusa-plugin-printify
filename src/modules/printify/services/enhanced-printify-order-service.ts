/**
 * Enhanced Printify Order Service with Comprehensive Error Handling
 * 
 * Wraps the existing PrintifyOrderService with robust error handling,
 * retry logic, and improved error reporting.
 */

import { PrintifyOrderService as BaseOrderService, CreateOrderRequest, OrderStatusUpdate, OrderListOptions } from './printify-order-service';
import PrintifyOrder from '../models/printify-order';
import { PrintifyOrderBridge } from '../utils/dml-bridge';
import { PrintifyOrderType as PrintifyOrderTypeTemp } from '../types';
import { OrderErrorHandler, OrderProcessingError, OrderErrorType } from '../utils/order-error-handling';
import { logger } from '../utils/logger';

export class EnhancedPrintifyOrderService extends BaseOrderService {
  private readonly errorHandler: OrderErrorHandler;
  private readonly serviceLogger = logger.child('EnhancedOrderService');

  constructor(...args: ConstructorParameters<typeof BaseOrderService>) {
    super(...args);
    this.errorHandler = new OrderErrorHandler();
  }

  /**
   * Create order with enhanced error handling
   */
  async createOrder(request: CreateOrderRequest): Promise<PrintifyOrderBridge> {
    const context = this.errorHandler.createContext('createOrder', undefined, {
      medusaOrderId: request.medusaOrderId,
      itemCount: request.cartItems.length,
    });

    return this.errorHandler.handleError(
      async () => {
        try {
          this.serviceLogger.info('Creating order with enhanced error handling', {
            medusaOrderId: request.medusaOrderId,
            customerEmail: request.customerEmail,
            itemCount: request.cartItems.length,
          });

          const order = await super.createOrder(request);
          
          this.serviceLogger.info('Order created successfully', {
            orderId: order.id,
            medusaOrderId: order.medusaOrderId,
            status: order.status,
          });

          return order;
        } catch (error) {
          // Enhanced error context for order creation
          if (error instanceof Error) {
            if (error.message.includes('validation')) {
              throw new OrderProcessingError(
                `Order validation failed: ${error.message}`,
                OrderErrorType.VALIDATION_ERROR,
                { ...context, medusaOrderId: request.medusaOrderId },
                { retryable: false, userFriendly: true }
              );
            } else if (error.message.includes('inventory') || error.message.includes('unavailable')) {
              throw new OrderProcessingError(
                `Inventory validation failed: ${error.message}`,
                OrderErrorType.INVENTORY_ERROR,
                { ...context, medusaOrderId: request.medusaOrderId },
                { retryable: false, userFriendly: true }
              );
            }
          }
          throw error;
        }
      },
      context,
      { maxRetries: 2 } // Limited retries for creation
    );
  }

  /**
   * Submit order with enhanced error handling and retries
   */
  async submitOrder(orderId: string): Promise<PrintifyOrderBridge> {
    const context = this.errorHandler.createContext('submitOrder', orderId);

    return this.errorHandler.handleError(
      async () => {
        try {
          this.serviceLogger.info('Submitting order to Printify', { orderId });

          const order = await super.submitOrder(orderId);
          
          this.serviceLogger.info('Order submitted successfully', {
            orderId: order.id,
            printifyOrderId: order.printifyOrderId,
            status: order.status,
          });

          return order;
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('rate limit')) {
              throw new OrderProcessingError(
                'Printify API rate limit reached',
                OrderErrorType.RATE_LIMIT_ERROR,
                { ...context, orderId },
                { retryable: true, userFriendly: true }
              );
            } else if (error.message.includes('payment') || error.message.includes('billing')) {
              throw new OrderProcessingError(
                `Payment processing failed: ${error.message}`,
                OrderErrorType.PAYMENT_ERROR,
                { ...context, orderId },
                { retryable: false, userFriendly: true }
              );
            } else if (error.message.includes('network') || error.message.includes('timeout')) {
              throw new OrderProcessingError(
                'Network error while submitting to Printify',
                OrderErrorType.NETWORK_ERROR,
                { ...context, orderId },
                { retryable: true, userFriendly: true }
              );
            }
          }
          throw error;
        }
      },
      context,
      { maxRetries: 5, baseDelay: 2000 } // More retries for submission
    );
  }

  /**
   * Sync order status with enhanced error handling
   */
  async syncOrderStatus(orderId: string): Promise<PrintifyOrderBridge> {
    const context = this.errorHandler.createContext('syncOrderStatus', orderId);

    return this.errorHandler.handleError(
      async () => {
        try {
          this.serviceLogger.info('Syncing order status with Printify', { orderId });

          const order = await super.syncOrderStatus(orderId);
          
          this.serviceLogger.info('Order status synced successfully', {
            orderId: order.id,
            status: order.status,
            trackingNumber: order.tracking?.trackingNumber,
          });

          return order;
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('not found')) {
              throw new OrderProcessingError(
                'Order not found in Printify system',
                OrderErrorType.API_ERROR,
                { ...context, orderId },
                { retryable: false, userFriendly: true }
              );
            } else if (error.message.includes('unauthorized')) {
              throw new OrderProcessingError(
                'Unauthorized access to Printify API',
                OrderErrorType.CONFIGURATION_ERROR,
                { ...context, orderId },
                { retryable: false, userFriendly: false }
              );
            }
          }
          throw error;
        }
      },
      context,
      { maxRetries: 3, baseDelay: 1000 }
    );
  }

  /**
   * Cancel order with enhanced error handling
   */
  async cancelOrder(orderId: string, reason: string): Promise<PrintifyOrderBridge> {
    const context = this.errorHandler.createContext('cancelOrder', orderId, { reason });

    return this.errorHandler.handleError(
      async () => {
        try {
          this.serviceLogger.info('Cancelling order', { orderId, reason });

          const order = await super.cancelOrder(orderId, reason);
          
          this.serviceLogger.info('Order cancelled successfully', {
            orderId: order.id,
            status: order.status,
            reason,
          });

          return order;
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('cannot be cancelled')) {
              throw new OrderProcessingError(
                'Order cannot be cancelled in its current state',
                OrderErrorType.BUSINESS_LOGIC_ERROR,
                { ...context, orderId },
                { retryable: false, userFriendly: true }
              );
            } else if (error.message.includes('already cancelled')) {
              throw new OrderProcessingError(
                'Order is already cancelled',
                OrderErrorType.BUSINESS_LOGIC_ERROR,
                { ...context, orderId },
                { retryable: false, userFriendly: true }
              );
            }
          }
          throw error;
        }
      },
      context,
      { maxRetries: 2 }
    );
  }

  /**
   * Update order status with enhanced error handling
   */
  async updateOrderStatus(orderId: string, update: OrderStatusUpdate): Promise<PrintifyOrderBridge> {
    const context = this.errorHandler.createContext('updateOrderStatus', orderId, {
      newStatus: update.status,
      note: update.note,
    });

    return this.errorHandler.handleError(
      async () => {
        try {
          this.serviceLogger.info('Updating order status', {
            orderId,
            newStatus: update.status,
            note: update.note,
          });

          const order = await super.updateOrderStatus(orderId, update);
          
          this.serviceLogger.info('Order status updated successfully', {
            orderId: order.id,
            oldStatus: context.metadata?.oldStatus,
            newStatus: order.status,
          });

          return order;
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('invalid status transition')) {
              throw new OrderProcessingError(
                `Invalid status transition: ${error.message}`,
                OrderErrorType.BUSINESS_LOGIC_ERROR,
                { ...context, orderId },
                { retryable: false, userFriendly: true }
              );
            }
          }
          throw error;
        }
      },
      context,
      { maxRetries: 1 }
    );
  }

  /**
   * List orders with enhanced error handling
   */
  async listOrders(options: OrderListOptions = {}) {
    const context = this.errorHandler.createContext('listOrders', undefined, {
      limit: options.limit,
      offset: options.offset,
      status: options.status,
    });

    return this.errorHandler.handleError(
      async () => {
        try {
          this.serviceLogger.debug('Listing orders with options', options);

          const result = await super.listOrders(options);
          
          this.serviceLogger.debug('Orders listed successfully', {
            count: result.orders.length,
            total: result.total,
            hasMore: result.hasMore,
          });

          return result;
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('database')) {
              throw new OrderProcessingError(
                'Database error while retrieving orders',
                OrderErrorType.API_ERROR,
                context,
                { retryable: true, userFriendly: false }
              );
            }
          }
          throw error;
        }
      },
      context,
      { maxRetries: 2 }
    );
  }

  /**
   * Get order by ID with enhanced error handling
   */
  getOrder(orderId: string): PrintifyOrderBridge {
    const context = this.errorHandler.createContext('getOrder', orderId);

    try {
      this.serviceLogger.debug('Getting order by ID', { orderId });

      const order = super.getOrder(orderId);
      
      this.serviceLogger.debug('Order retrieved successfully', {
        orderId: order.id,
        status: order.status,
      });

      return order;
    } catch (error) {
      // Process the error but re-throw to maintain interface
      const orderError = this.errorHandler.processError(error, context, 0);
      
      this.serviceLogger.error('Failed to get order', orderError.orderContext.originalError, {
        orderId,
        errorType: orderError.errorType,
      });

      throw orderError;
    }
  }

  /**
   * Batch operation with enhanced error handling
   */
  async processBatchOrders(operations: Array<() => Promise<any>>): Promise<{
    successful: any[];
    failed: { error: OrderProcessingError; index: number }[];
  }> {
    const successful: any[] = [];
    const failed: { error: OrderProcessingError; index: number }[] = [];

    this.serviceLogger.info('Processing batch operations', {
      operationCount: operations.length,
    });

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      if (!operation) continue;
      
      try {
        const result = await operation();
        successful.push(result);
      } catch (error) {
        const orderError = this.errorHandler.processError(
          error,
          this.errorHandler.createContext('batchOperation', undefined, { operationIndex: i }),
          0
        );
        failed.push({ error: orderError, index: i });
      }
    }

    this.serviceLogger.info('Batch operations completed', {
      successful: successful.length,
      failed: failed.length,
      totalOperations: operations.length,
    });

    return { successful, failed };
  }

  /**
   * Health check for order processing system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const context = this.errorHandler.createContext('healthCheck');
    
    try {
      this.serviceLogger.info('Performing order service health check');

      // Test basic operations
      const stats = await super.getOrderStats();
      
      // Test API connectivity by attempting a lightweight operation
      await this.listOrders({ limit: 1 });

      this.serviceLogger.info('Health check passed');

      return {
        status: 'healthy',
        details: {
          timestamp: new Date().toISOString(),
          orderCount: stats.total,
          lastCheck: new Date().toISOString(),
        },
      };
    } catch (error) {
      const orderError = this.errorHandler.processError(error, context, 0);
      
      this.serviceLogger.error('Health check failed', orderError.orderContext.originalError, {
        errorType: orderError.errorType,
        retryable: orderError.retryable,
      });

      return {
        status: orderError.retryable ? 'degraded' : 'unhealthy',
        details: {
          timestamp: new Date().toISOString(),
          error: orderError.getUserMessage(),
          errorType: orderError.errorType,
          retryable: orderError.retryable,
        },
      };
    }
  }
}