/**
 * SyncLog Entity
 * 
 * Tracks synchronization activities between Medusa and Printify.
 * This entity provides audit trail and debugging information for sync operations.
 */

export type SyncLogType = 'full_sync' | 'partial_sync' | 'webhook_sync' | 'manual_sync';
export type SyncLogStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SyncLogData {
  id: string;
  configuration_id: string;
  type: SyncLogType;
  status: SyncLogStatus;
  started_at: Date;
  completed_at?: Date;
  products_synced: number;
  products_failed: number;
  error_message?: string;
  error_details?: Record<string, any>;
  sync_details: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface SyncLogMetrics {
  duration_ms?: number;
  total_products: number;
  successful_products: number;
  failed_products: number;
  success_rate: number;
}

export class SyncLog {
  public readonly id: string;
  public readonly configuration_id: string;
  public readonly type: SyncLogType;
  public status: SyncLogStatus;
  public readonly started_at: Date;
  public completed_at?: Date;
  public products_synced: number;
  public products_failed: number;
  public error_message?: string;
  public error_details?: Record<string, any>;
  public sync_details: Record<string, any>;
  public readonly created_at: Date;
  public updated_at: Date;

  constructor(data: SyncLogData) {
    this.id = data.id;
    this.configuration_id = data.configuration_id;
    this.type = data.type;
    this.status = data.status;
    this.started_at = data.started_at;
    this.completed_at = data.completed_at;
    this.products_synced = data.products_synced;
    this.products_failed = data.products_failed;
    this.error_message = data.error_message;
    this.error_details = data.error_details;
    this.sync_details = data.sync_details;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Mark sync as running
   */
  markRunning(): void {
    this.status = 'running';
    this.updated_at = new Date();
  }

  /**
   * Mark sync as completed successfully
   */
  markCompleted(): void {
    this.status = 'completed';
    this.completed_at = new Date();
    this.updated_at = new Date();
  }

  /**
   * Mark sync as failed with error details
   */
  markFailed(error: string, details?: Record<string, any>): void {
    this.status = 'failed';
    this.error_message = error;
    this.error_details = details;
    this.completed_at = new Date();
    this.updated_at = new Date();
  }

  /**
   * Mark sync as cancelled
   */
  markCancelled(): void {
    this.status = 'cancelled';
    this.completed_at = new Date();
    this.updated_at = new Date();
  }

  /**
   * Update sync progress
   */
  updateProgress(synced: number, failed: number): void {
    this.products_synced = synced;
    this.products_failed = failed;
    this.updated_at = new Date();
  }

  /**
   * Add details to sync log
   */
  addDetails(key: string, value: any): void {
    this.sync_details[key] = value;
    this.updated_at = new Date();
  }

  /**
   * Get sync duration in milliseconds
   */
  getDurationMs(): number | undefined {
    if (!this.completed_at) {
      return undefined;
    }
    
    return this.completed_at.getTime() - this.started_at.getTime();
  }

  /**
   * Get sync metrics
   */
  getMetrics(): SyncLogMetrics {
    const total = this.products_synced + this.products_failed;
    const successRate = total > 0 ? (this.products_synced / total) * 100 : 0;
    
    return {
      duration_ms: this.getDurationMs(),
      total_products: total,
      successful_products: this.products_synced,
      failed_products: this.products_failed,
      success_rate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Check if sync is in progress
   */
  isInProgress(): boolean {
    return this.status === 'pending' || this.status === 'running';
  }

  /**
   * Check if sync was successful
   */
  isSuccessful(): boolean {
    return this.status === 'completed' && this.products_failed === 0;
  }

  /**
   * Check if sync had partial success
   */
  hasPartialSuccess(): boolean {
    return this.status === 'completed' && this.products_synced > 0 && this.products_failed > 0;
  }

  /**
   * Convert to plain object for database storage
   */
  toData(): SyncLogData {
    return {
      id: this.id,
      configuration_id: this.configuration_id,
      type: this.type,
      status: this.status,
      started_at: this.started_at,
      completed_at: this.completed_at,
      products_synced: this.products_synced,
      products_failed: this.products_failed,
      error_message: this.error_message,
      error_details: this.error_details,
      sync_details: this.sync_details,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  /**
   * Create a new sync log
   */
  static create(params: {
    configuration_id: string;
    type: SyncLogType;
    details?: Record<string, any>;
  }): SyncLog {
    const now = new Date();
    const id = `sync_log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const data: SyncLogData = {
      id,
      configuration_id: params.configuration_id,
      type: params.type,
      status: 'pending',
      started_at: now,
      products_synced: 0,
      products_failed: 0,
      sync_details: params.details || {},
      created_at: now,
      updated_at: now,
    };

    return new SyncLog(data);
  }
}