/**
 * ProductEnablementHistory Entity
 * 
 * Tracks the history of product enablement changes for audit and rollback purposes.
 * This entity provides a complete audit trail of all product enablement/disablement actions.
 */

export type EnablementAction = 'enabled' | 'disabled' | 'bulk_enabled' | 'bulk_disabled';

export interface ProductEnablementHistoryData {
  id: string;
  product_id: string;
  configuration_id: string;
  action: EnablementAction;
  previous_state: boolean;
  new_state: boolean;
  triggered_by: string; // user ID or 'system'
  reason?: string;
  bulk_operation_id?: string; // for grouping bulk operations
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface BulkEnablementSummary {
  operation_id: string;
  action: EnablementAction;
  total_products: number;
  triggered_by: string;
  created_at: Date;
}

export class ProductEnablementHistory {
  public readonly id: string;
  public readonly product_id: string;
  public readonly configuration_id: string;
  public readonly action: EnablementAction;
  public readonly previous_state: boolean;
  public readonly new_state: boolean;
  public readonly triggered_by: string;
  public readonly reason?: string;
  public readonly bulk_operation_id?: string;
  public readonly metadata?: Record<string, any>;
  public readonly created_at: Date;

  constructor(data: ProductEnablementHistoryData) {
    this.id = data.id;
    this.product_id = data.product_id;
    this.configuration_id = data.configuration_id;
    this.action = data.action;
    this.previous_state = data.previous_state;
    this.new_state = data.new_state;
    this.triggered_by = data.triggered_by;
    this.reason = data.reason;
    this.bulk_operation_id = data.bulk_operation_id;
    this.metadata = data.metadata;
    this.created_at = data.created_at;
  }

  /**
   * Check if this was a bulk operation
   */
  isBulkOperation(): boolean {
    return this.bulk_operation_id !== undefined;
  }

  /**
   * Check if state actually changed
   */
  isStateChange(): boolean {
    return this.previous_state !== this.new_state;
  }

  /**
   * Get action description for display
   */
  getActionDescription(): string {
    switch (this.action) {
      case 'enabled':
        return 'Product enabled for storefront';
      case 'disabled':
        return 'Product disabled from storefront';
      case 'bulk_enabled':
        return 'Product enabled via bulk operation';
      case 'bulk_disabled':
        return 'Product disabled via bulk operation';
      default:
        return 'Unknown action';
    }
  }

  /**
   * Convert to plain object for database storage
   */
  toData(): ProductEnablementHistoryData {
    return {
      id: this.id,
      product_id: this.product_id,
      configuration_id: this.configuration_id,
      action: this.action,
      previous_state: this.previous_state,
      new_state: this.new_state,
      triggered_by: this.triggered_by,
      reason: this.reason,
      bulk_operation_id: this.bulk_operation_id,
      metadata: this.metadata,
      created_at: this.created_at,
    };
  }

  /**
   * Create a new enablement history record
   */
  static create(params: {
    product_id: string;
    configuration_id: string;
    action: EnablementAction;
    previous_state: boolean;
    new_state: boolean;
    triggered_by: string;
    reason?: string;
    bulk_operation_id?: string;
    metadata?: Record<string, any>;
  }): ProductEnablementHistory {
    const now = new Date();
    const id = `enablement_history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const data: ProductEnablementHistoryData = {
      id,
      product_id: params.product_id,
      configuration_id: params.configuration_id,
      action: params.action,
      previous_state: params.previous_state,
      new_state: params.new_state,
      triggered_by: params.triggered_by,
      reason: params.reason,
      bulk_operation_id: params.bulk_operation_id,
      metadata: params.metadata,
      created_at: now,
    };

    return new ProductEnablementHistory(data);
  }

  /**
   * Generate a bulk operation ID for grouping related operations
   */
  static generateBulkOperationId(): string {
    return `bulk_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create history for individual product enablement
   */
  static forProductEnable(params: {
    product_id: string;
    configuration_id: string;
    previous_state: boolean;
    triggered_by: string;
    reason?: string;
  }): ProductEnablementHistory {
    return this.create({
      ...params,
      action: 'enabled',
      new_state: true,
    });
  }

  /**
   * Create history for individual product disablement
   */
  static forProductDisable(params: {
    product_id: string;
    configuration_id: string;
    previous_state: boolean;
    triggered_by: string;
    reason?: string;
  }): ProductEnablementHistory {
    return this.create({
      ...params,
      action: 'disabled',
      new_state: false,
    });
  }

  /**
   * Create history for bulk product enablement
   */
  static forBulkEnable(params: {
    product_id: string;
    configuration_id: string;
    previous_state: boolean;
    triggered_by: string;
    bulk_operation_id: string;
    reason?: string;
  }): ProductEnablementHistory {
    return this.create({
      ...params,
      action: 'bulk_enabled',
      new_state: true,
    });
  }

  /**
   * Create history for bulk product disablement
   */
  static forBulkDisable(params: {
    product_id: string;
    configuration_id: string;
    previous_state: boolean;
    triggered_by: string;
    bulk_operation_id: string;
    reason?: string;
  }): ProductEnablementHistory {
    return this.create({
      ...params,
      action: 'bulk_disabled',
      new_state: false,
    });
  }
}