/**
 * Printify Order Service
 * 
 * Handles order creation, validation, submission to Printify,
 * and order status management.
 */

import { PrintifyOrder, PrintifyOrderStatus, PrintifyOrderShippingAddress } from '../models/printify-order';
import { PrintifyCartItem } from '../models/printify-cart-item';
import { PrintifyApiClient } from './printify-api-client';
import { StorefrontProductService } from './storefront-product-service';
import { PrintifyPluginError, ErrorCode, ErrorSeverity } from '../utils/error-handling';
import { logger } from '../utils/logger';

export interface CreateOrderRequest {
  medusaOrderId: string;
  customerId?: string;
  customerEmail: string;
  cartItems: PrintifyCartItem[];
  shippingAddress: PrintifyOrderShippingAddress;
  shippingCost?: number;
  taxAmount?: number;
  discountAmount?: number;
}

export interface OrderStatusUpdate {
  printifyOrderId?: string;
  status: PrintifyOrderStatus;
  note?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  carrier?: string;
  shippedAt?: Date;
  estimatedDelivery?: Date;
}

export interface OrderListOptions {
  status?: PrintifyOrderStatus[];
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface OrderStats {
  total: number;
  pending: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  failed: number;
  averageProcessingTime: number; // in hours
  totalValue: number; // in cents
  currency: string;
}

export class PrintifyOrderService {
  private orders: Map<string, PrintifyOrder> = new Map();
  private ordersByMedusaId: Map<string, string> = new Map();
  private ordersByPrintifyId: Map<string, string> = new Map();

  constructor(
    private apiClient: PrintifyApiClient,
    private storefrontService: StorefrontProductService
  ) {}

  /**
   * Create order from cart items
   */
  async createOrder(request: CreateOrderRequest): Promise<PrintifyOrder> {
    try {
      logger.info('Creating Printify order', {
        medusaOrderId: request.medusaOrderId,
        itemCount: request.cartItems.length,
      });

      // Validate cart items are still available
      await this.validateCartItems(request.cartItems);

      // Create order from cart items
      const order = PrintifyOrder.fromCartItems(request.cartItems, request.medusaOrderId, {
        customerId: request.customerId,
        email: request.customerEmail,
        shippingAddress: request.shippingAddress,
      });

      // Update pricing with shipping and tax
      if (request.shippingCost !== undefined) {
        order.pricing.shippingCost = request.shippingCost;
      }
      if (request.taxAmount !== undefined) {
        order.pricing.taxAmount = request.taxAmount;
      }
      if (request.discountAmount !== undefined) {
        order.pricing.discountAmount = request.discountAmount;
      }

      // Recalculate total
      order.pricing.total = order.pricing.subtotal + order.pricing.shippingCost + 
                           order.pricing.taxAmount - order.pricing.discountAmount;

      // Validate order
      const validation = order.validate();
      if (!validation.isValid) {
        throw new PrintifyPluginError(
          ErrorCode.VALIDATION_ERROR,
          `Order validation failed: ${validation.errors.join(', ')}`,
          ErrorSeverity.HIGH,
          { errors: validation.errors }
        );
      }

      // Store order
      this.orders.set(order.id, order);
      this.ordersByMedusaId.set(order.medusaOrderId, order.id);

      // Update status to validated
      order.updateStatus(PrintifyOrderStatus.VALIDATED, 'Order created and validated');

      logger.info('Successfully created Printify order', {
        orderId: order.id,
        medusaOrderId: order.medusaOrderId,
        total: order.getFormattedTotal(),
      });

      return order;
    } catch (error) {
      logger.error('Failed to create order', error as Error, {
        medusaOrderId: request.medusaOrderId,
      });
      throw error;
    }
  }

  /**
   * Submit order to Printify
   */
  async submitOrder(orderId: string): Promise<PrintifyOrder> {
    try {
      const order = this.getOrder(orderId);
      
      logger.info('Submitting order to Printify', {
        orderId: order.id,
        medusaOrderId: order.medusaOrderId,
      });

      if (!order.canSubmit()) {
        throw new PrintifyPluginError(
          ErrorCode.VALIDATION_ERROR,
          'Order cannot be submitted in current state',
          ErrorSeverity.MEDIUM,
          { status: order.status, retryCount: order.retryCount }
        );
      }

      // Prepare order data for Printify API
      const printifyOrderData = this.preparePrintifyOrderData(order);

      // Submit to Printify
      const response = await this.apiClient.createOrder(printifyOrderData);
      
      if (!response || !response.id) {
        throw new PrintifyPluginError(
          ErrorCode.API_SERVER_ERROR,
          'Invalid response from Printify API',
          ErrorSeverity.HIGH
        );
      }

      // Update order with Printify ID and status
      order.updateStatus(
        PrintifyOrderStatus.SUBMITTED, 
        'Order submitted to Printify',
        response.id
      );
      
      this.ordersByPrintifyId.set(response.id, order.id);
      order.clearError();

      logger.info('Successfully submitted order to Printify', {
        orderId: order.id,
        printifyOrderId: response.id,
        status: response.status,
      });

      return order;
    } catch (error) {
      const order = this.orders.get(orderId);
      if (order) {
        order.setError((error as Error).message);
      }
      
      logger.error('Failed to submit order to Printify', error as Error, { orderId });
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  getOrder(orderId: string): PrintifyOrder {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new PrintifyPluginError(
        ErrorCode.ENTITY_NOT_FOUND,
        'Order not found',
        ErrorSeverity.MEDIUM,
        { orderId }
      );
    }
    return order;
  }

  /**
   * Get order by Medusa order ID
   */
  getOrderByMedusaId(medusaOrderId: string): PrintifyOrder | null {
    const orderId = this.ordersByMedusaId.get(medusaOrderId);
    return orderId ? this.orders.get(orderId) || null : null;
  }

  /**
   * Get order by Printify order ID
   */
  getOrderByPrintifyId(printifyOrderId: string): PrintifyOrder | null {
    const orderId = this.ordersByPrintifyId.get(printifyOrderId);
    return orderId ? this.orders.get(orderId) || null : null;
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, update: OrderStatusUpdate): Promise<PrintifyOrder> {
    try {
      const order = this.getOrder(orderId);

      logger.info('Updating order status', {
        orderId: order.id,
        currentStatus: order.status,
        newStatus: update.status,
      });

      // Update status
      order.updateStatus(update.status, update.note, update.printifyOrderId);

      // Update tracking information if provided
      if (update.trackingNumber || update.trackingUrl || update.carrier) {
        order.updateTracking({
          trackingNumber: update.trackingNumber,
          trackingUrl: update.trackingUrl,
          carrier: update.carrier,
          shippedAt: update.shippedAt,
          estimatedDelivery: update.estimatedDelivery,
        });
      }

      // Update Printify order ID mapping if provided
      if (update.printifyOrderId && !this.ordersByPrintifyId.has(update.printifyOrderId)) {
        this.ordersByPrintifyId.set(update.printifyOrderId, order.id);
      }

      logger.info('Successfully updated order status', {
        orderId: order.id,
        status: order.status,
        printifyOrderId: order.printifyOrderId,
      });

      return order;
    } catch (error) {
      logger.error('Failed to update order status', error as Error, { orderId });
      throw error;
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, reason?: string): Promise<PrintifyOrder> {
    try {
      const order = this.getOrder(orderId);

      logger.info('Cancelling order', {
        orderId: order.id,
        printifyOrderId: order.printifyOrderId,
        reason,
      });

      if (!order.canCancel()) {
        throw new PrintifyPluginError(
          ErrorCode.VALIDATION_ERROR,
          'Order cannot be cancelled in current state',
          ErrorSeverity.MEDIUM,
          { status: order.status }
        );
      }

      // Cancel on Printify if order was submitted
      if (order.printifyOrderId && order.status !== PrintifyOrderStatus.PENDING) {
        try {
          await this.apiClient.cancelOrder(order.printifyOrderId);
        } catch (error) {
          logger.warn('Failed to cancel order on Printify', {
            printifyOrderId: order.printifyOrderId,
            error: (error as Error).message,
          });
          // Continue with local cancellation even if Printify cancellation fails
        }
      }

      // Update order status
      order.updateStatus(PrintifyOrderStatus.CANCELLED, reason || 'Order cancelled');

      logger.info('Successfully cancelled order', {
        orderId: order.id,
        printifyOrderId: order.printifyOrderId,
      });

      return order;
    } catch (error) {
      logger.error('Failed to cancel order', error as Error, { orderId });
      throw error;
    }
  }

  /**
   * List orders with filtering and pagination
   */
  async listOrders(options: OrderListOptions = {}): Promise<{
    orders: PrintifyOrder[];
    total: number;
    hasMore: boolean;
  }> {
    const {
      status,
      customerId,
      dateFrom,
      dateTo,
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    // Filter orders
    let filteredOrders = Array.from(this.orders.values());

    if (status && status.length > 0) {
      filteredOrders = filteredOrders.filter(order => status.includes(order.status));
    }

    if (customerId) {
      filteredOrders = filteredOrders.filter(order => order.customerId === customerId);
    }

    if (dateFrom) {
      filteredOrders = filteredOrders.filter(order => order.createdAt >= dateFrom);
    }

    if (dateTo) {
      filteredOrders = filteredOrders.filter(order => order.createdAt <= dateTo);
    }

    // Sort orders
    filteredOrders.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Paginate
    const total = filteredOrders.length;
    const paginatedOrders = filteredOrders.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      orders: paginatedOrders,
      total,
      hasMore,
    };
  }

  /**
   * Get order statistics
   */
  async getOrderStats(): Promise<OrderStats> {
    const orders = Array.from(this.orders.values());
    
    const stats: OrderStats = {
      total: orders.length,
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      failed: 0,
      averageProcessingTime: 0,
      totalValue: 0,
      currency: 'USD',
    };

    let totalProcessingTime = 0;
    let processedOrdersCount = 0;

    orders.forEach(order => {
      // Count by status
      switch (order.status) {
        case PrintifyOrderStatus.PENDING:
        case PrintifyOrderStatus.VALIDATED:
          stats.pending++;
          break;
        case PrintifyOrderStatus.SUBMITTED:
        case PrintifyOrderStatus.PROCESSING:
          stats.processing++;
          break;
        case PrintifyOrderStatus.SHIPPED:
          stats.shipped++;
          break;
        case PrintifyOrderStatus.DELIVERED:
          stats.delivered++;
          break;
        case PrintifyOrderStatus.CANCELLED:
          stats.cancelled++;
          break;
        case PrintifyOrderStatus.FAILED:
          stats.failed++;
          break;
      }

      // Calculate total value
      if (!order.isFinalStatus() || order.status === PrintifyOrderStatus.DELIVERED) {
        stats.totalValue += order.pricing.total;
      }

      // Calculate processing time for completed orders
      if (order.submittedAt && (order.status === PrintifyOrderStatus.SHIPPED || order.status === PrintifyOrderStatus.DELIVERED)) {
        totalProcessingTime += order.getOrderDuration();
        processedOrdersCount++;
      }
    });

    // Calculate average processing time
    if (processedOrdersCount > 0) {
      stats.averageProcessingTime = Math.round(totalProcessingTime / processedOrdersCount);
    }

    return stats;
  }

  /**
   * Retry failed order
   */
  async retryOrder(orderId: string): Promise<PrintifyOrder> {
    const order = this.getOrder(orderId);

    if (order.status !== PrintifyOrderStatus.FAILED) {
      throw new PrintifyPluginError(
        ErrorCode.VALIDATION_ERROR,
        'Only failed orders can be retried',
        ErrorSeverity.MEDIUM,
        { status: order.status }
      );
    }

    if (order.retryCount >= order.maxRetries) {
      throw new PrintifyPluginError(
        ErrorCode.VALIDATION_ERROR,
        'Maximum retry attempts exceeded',
        ErrorSeverity.MEDIUM,
        { retryCount: order.retryCount, maxRetries: order.maxRetries }
      );
    }

    // Reset order to validated status
    order.updateStatus(PrintifyOrderStatus.VALIDATED, 'Order retry initiated');
    order.clearError();

    return this.submitOrder(orderId);
  }

  /**
   * Sync order status from Printify
   */
  async syncOrderStatus(orderId: string): Promise<PrintifyOrder> {
    const order = this.getOrder(orderId);

    if (!order.printifyOrderId) {
      throw new PrintifyPluginError(
        ErrorCode.VALIDATION_ERROR,
        'Order has not been submitted to Printify',
        ErrorSeverity.MEDIUM
      );
    }

    try {
      const response = await this.apiClient.getOrder(order.printifyOrderId);
      
      if (!response) {
        throw new PrintifyPluginError(
          ErrorCode.API_SERVER_ERROR,
          'Invalid response from Printify API',
          ErrorSeverity.HIGH
        );
      }

      // Update order status based on Printify response
      const printifyStatus = this.mapPrintifyStatus(response.status);
      if (printifyStatus !== order.status) {
        order.updateStatus(printifyStatus, `Status synced from Printify: ${response.status}`);
      }

      // Update tracking information if available
      if (response.tracking) {
        order.updateTracking({
          trackingNumber: response.tracking.tracking_number,
          trackingUrl: response.tracking.tracking_url,
          carrier: response.tracking.carrier,
        });
      }

      return order;
    } catch (error) {
      logger.error('Failed to sync order status from Printify', error as Error, {
        orderId,
        printifyOrderId: order.printifyOrderId,
      });
      throw error;
    }
  }

  /**
   * Validate cart items are still available
   */
  private async validateCartItems(cartItems: PrintifyCartItem[]): Promise<void> {
    for (const item of cartItems) {
      const variants = await this.storefrontService.getProductVariants(item.productId);
      const variant = variants.find(v => v.id === item.variantId);
      
      if (!variant) {
        throw new PrintifyPluginError(
          ErrorCode.PRODUCT_NOT_FOUND,
          `Product variant not found: ${item.variantId}`,
          ErrorSeverity.HIGH
        );
      }

      if (!variant.isAvailableForPurchase()) {
        throw new PrintifyPluginError(
          ErrorCode.VALIDATION_ERROR,
          `Product variant no longer available: ${item.variantId}`,
          ErrorSeverity.HIGH
        );
      }

      const quantityValidation = variant.validateQuantity(item.quantity);
      if (!quantityValidation.isValid) {
        throw new PrintifyPluginError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid quantity for variant ${item.variantId}: ${quantityValidation.reason}`,
          ErrorSeverity.HIGH
        );
      }
    }
  }

  /**
   * Prepare order data for Printify API
   */
  private preparePrintifyOrderData(order: PrintifyOrder): Record<string, any> {
    return {
      external_id: order.medusaOrderId,
      label: `Medusa Order ${order.medusaOrderId}`,
      line_items: order.items.map(item => ({
        product_id: item.printifyProductId,
        variant_id: item.printifyVariantId,
        quantity: item.quantity,
        print_areas: item.customization ? [{
          variant_ids: [item.printifyVariantId],
          placeholders: item.customization.personalizationFields || {},
        }] : undefined,
      })),
      shipping_method: 1, // Standard shipping
      send_shipping_notification: true,
      address_to: {
        first_name: order.shippingAddress.firstName,
        last_name: order.shippingAddress.lastName,
        email: order.shippingAddress.email,
        phone: order.shippingAddress.phone || '',
        company: order.shippingAddress.company || '',
        address1: order.shippingAddress.address1,
        address2: order.shippingAddress.address2 || '',
        city: order.shippingAddress.city,
        state_code: order.shippingAddress.state || '',
        zip: order.shippingAddress.zip,
        country_code: order.shippingAddress.country,
      },
    };
  }

  /**
   * Map Printify status to our internal status
   */
  private mapPrintifyStatus(printifyStatus: string): PrintifyOrderStatus {
    switch (printifyStatus.toLowerCase()) {
      case 'pending':
        return PrintifyOrderStatus.SUBMITTED;
      case 'in-production':
      case 'production':
        return PrintifyOrderStatus.PROCESSING;
      case 'shipped':
        return PrintifyOrderStatus.SHIPPED;
      case 'delivered':
        return PrintifyOrderStatus.DELIVERED;
      case 'canceled':
      case 'cancelled':
        return PrintifyOrderStatus.CANCELLED;
      case 'failed':
        return PrintifyOrderStatus.FAILED;
      default:
        return PrintifyOrderStatus.PROCESSING;
    }
  }

  /**
   * Clear all orders (for testing)
   */
  clearOrders(): void {
    this.orders.clear();
    this.ordersByMedusaId.clear();
    this.ordersByPrintifyId.clear();
  }
}