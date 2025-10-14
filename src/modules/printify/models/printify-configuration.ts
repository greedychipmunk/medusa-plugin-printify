/**
 * PrintifyConfiguration Entity
 * 
 * Stores plugin configuration and API credentials for Printify integration.
 * This is the central configuration entity that holds all settings needed
 * to connect to the Printify API and manage synchronization.
 */

export interface PrintifyConfigurationData {
  id: string;
  store_id: string;
  printify_api_key: string; // encrypted
  printify_shop_id: string;
  webhook_secret?: string; // encrypted
  sync_enabled: boolean;
  sync_frequency: number; // minutes
  created_at: Date;
  updated_at: Date;
}

export class PrintifyConfiguration {
  public readonly id: string;
  public readonly store_id: string;
  private _printify_api_key: string;
  public readonly printify_shop_id: string;
  private _webhook_secret?: string;
  public sync_enabled: boolean;
  public sync_frequency: number;
  public readonly created_at: Date;
  public updated_at: Date;

  constructor(data: PrintifyConfigurationData) {
    this.id = data.id;
    this.store_id = data.store_id;
    this._printify_api_key = data.printify_api_key;
    this.printify_shop_id = data.printify_shop_id;
    this._webhook_secret = data.webhook_secret;
    this.sync_enabled = data.sync_enabled;
    this.sync_frequency = data.sync_frequency;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Get the encrypted API key
   */
  getApiKey(): string {
    return this._printify_api_key;
  }

  /**
   * Set a new API key (will be encrypted)
   */
  setApiKey(apiKey: string): void {
    this._printify_api_key = apiKey;
    this.updated_at = new Date();
  }

  /**
   * Get the encrypted webhook secret
   */
  getWebhookSecret(): string | undefined {
    return this._webhook_secret;
  }

  /**
   * Set a new webhook secret (will be encrypted)
   */
  setWebhookSecret(secret: string): void {
    this._webhook_secret = secret;
    this.updated_at = new Date();
  }

  /**
   * Update sync settings
   */
  updateSyncSettings(enabled: boolean, frequency?: number): void {
    this.sync_enabled = enabled;
    if (frequency !== undefined) {
      this.validateSyncFrequency(frequency);
      this.sync_frequency = frequency;
    }
    this.updated_at = new Date();
  }

  /**
   * Validate sync frequency is within acceptable range
   */
  private validateSyncFrequency(frequency: number): void {
    if (frequency < 5 || frequency > 1440) {
      throw new Error('Sync frequency must be between 5 and 1440 minutes');
    }
  }

  /**
   * Convert to plain object for database storage
   */
  toData(): PrintifyConfigurationData {
    return {
      id: this.id,
      store_id: this.store_id,
      printify_api_key: this._printify_api_key,
      printify_shop_id: this.printify_shop_id,
      webhook_secret: this._webhook_secret,
      sync_enabled: this.sync_enabled,
      sync_frequency: this.sync_frequency,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  /**
   * Create a new configuration with validation
   */
  static create(params: {
    store_id: string;
    printify_api_key: string;
    printify_shop_id: string;
    webhook_secret?: string;
    sync_enabled?: boolean;
    sync_frequency?: number;
  }): PrintifyConfiguration {
    const now = new Date();
    const id = `printify_config_${Date.now()}`; // Simple ID generation
    
    const data: PrintifyConfigurationData = {
      id,
      store_id: params.store_id,
      printify_api_key: params.printify_api_key,
      printify_shop_id: params.printify_shop_id,
      webhook_secret: params.webhook_secret,
      sync_enabled: params.sync_enabled ?? true,
      sync_frequency: params.sync_frequency ?? 60,
      created_at: now,
      updated_at: now,
    };

    return new PrintifyConfiguration(data);
  }
}