/**
 * PrintifyConfigurationService
 * 
 * Service for managing Printify plugin configuration including
 * API credentials, sync settings, and connection management.
 */

import { PrintifyConfiguration, PrintifyConfigurationData } from '../models/printify-configuration';
import { PrintifyApiClient } from './printify-api-client';
import { logger } from '../utils/logger';
import { ErrorFactory, PrintifyPluginError } from '../utils/error-handling';

export interface CreateConfigurationParams {
  store_id: string;
  printify_api_key: string;
  printify_shop_id: string;
  webhook_secret?: string;
  sync_enabled?: boolean;
  sync_frequency?: number;
}

export interface UpdateConfigurationParams {
  printify_api_key?: string;
  printify_shop_id?: string;
  webhook_secret?: string;
  sync_enabled?: boolean;
  sync_frequency?: number;
}

export interface ConfigurationTestResult {
  success: boolean;
  shop_info?: {
    id: number;
    title: string;
    sales_channel: string;
  };
  error?: string;
}

/**
 * Service for managing Printify plugin configurations
 */
export class PrintifyConfigurationService {
  private logger = logger.child('ConfigurationService');

  /**
   * Get configuration for a store
   */
  async getConfiguration(storeId: string): Promise<PrintifyConfiguration | null> {
    this.logger.info('Getting configuration for store', { storeId });

    try {
      // In a real implementation, this would query the database
      // For now, we'll return null to indicate no configuration exists
      this.logger.debug('Configuration lookup completed', { storeId, found: false });
      return null;
    } catch (error) {
      this.logger.error('Failed to get configuration', error as Error, { storeId });
      throw ErrorFactory.databaseError('Failed to retrieve configuration', error as Error);
    }
  }

  /**
   * Create new configuration for a store
   */
  async createConfiguration(params: CreateConfigurationParams): Promise<PrintifyConfiguration> {
    this.logger.info('Creating new configuration', { 
      storeId: params.store_id,
      shopId: params.printify_shop_id 
    });

    try {
      // Validate configuration by testing API connection
      await this.validateConfiguration({
        apiKey: params.printify_api_key,
        shopId: params.printify_shop_id,
      });

      // Create configuration entity
      const configuration = PrintifyConfiguration.create(params);

      // In a real implementation, this would save to database
      this.logger.info('Configuration created successfully', { 
        configId: configuration.id,
        storeId: params.store_id 
      });

      return configuration;
    } catch (error) {
      this.logger.error('Failed to create configuration', error as Error, { 
        storeId: params.store_id 
      });
      
      if (error instanceof PrintifyPluginError) {
        throw error;
      }
      
      throw ErrorFactory.configError('Failed to create configuration', { 
        storeId: params.store_id 
      });
    }
  }

  /**
   * Update existing configuration
   */
  async updateConfiguration(
    storeId: string, 
    params: UpdateConfigurationParams
  ): Promise<PrintifyConfiguration> {
    this.logger.info('Updating configuration', { storeId });

    try {
      // Get existing configuration
      const existingConfig = await this.getConfiguration(storeId);
      if (!existingConfig) {
        throw ErrorFactory.configError('Configuration not found', { storeId });
      }

      // Test new configuration if API credentials are being updated
      if (params.printify_api_key || params.printify_shop_id) {
        await this.validateConfiguration({
          apiKey: params.printify_api_key || existingConfig.getApiKey(),
          shopId: params.printify_shop_id || existingConfig.printify_shop_id,
        });
      }

      // Update configuration fields
      if (params.printify_api_key) {
        existingConfig.setApiKey(params.printify_api_key);
      }

      if (params.webhook_secret) {
        existingConfig.setWebhookSecret(params.webhook_secret);
      }

      if (params.sync_enabled !== undefined || params.sync_frequency !== undefined) {
        existingConfig.updateSyncSettings(
          params.sync_enabled ?? existingConfig.sync_enabled,
          params.sync_frequency
        );
      }

      // In a real implementation, this would save to database
      this.logger.info('Configuration updated successfully', { 
        configId: existingConfig.id,
        storeId 
      });

      return existingConfig;
    } catch (error) {
      this.logger.error('Failed to update configuration', error as Error, { storeId });
      
      if (error instanceof PrintifyPluginError) {
        throw error;
      }
      
      throw ErrorFactory.configError('Failed to update configuration', { storeId });
    }
  }

  /**
   * Delete configuration for a store
   */
  async deleteConfiguration(storeId: string): Promise<void> {
    this.logger.info('Deleting configuration', { storeId });

    try {
      const existingConfig = await this.getConfiguration(storeId);
      if (!existingConfig) {
        throw ErrorFactory.configError('Configuration not found', { storeId });
      }

      // In a real implementation, this would delete from database
      this.logger.info('Configuration deleted successfully', { 
        configId: existingConfig.id,
        storeId 
      });
    } catch (error) {
      this.logger.error('Failed to delete configuration', error as Error, { storeId });
      
      if (error instanceof PrintifyPluginError) {
        throw error;
      }
      
      throw ErrorFactory.configError('Failed to delete configuration', { storeId });
    }
  }

  /**
   * Test configuration by attempting to connect to Printify API
   */
  async testConfiguration(storeId: string): Promise<ConfigurationTestResult> {
    this.logger.info('Testing configuration', { storeId });

    try {
      const configuration = await this.getConfiguration(storeId);
      if (!configuration) {
        return {
          success: false,
          error: 'Configuration not found',
        };
      }

      return await this.validateConfiguration({
        apiKey: configuration.getApiKey(),
        shopId: configuration.printify_shop_id,
      });
    } catch (error) {
      this.logger.error('Configuration test failed', error as Error, { storeId });
      
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Validate configuration by testing API connection
   */
  private async validateConfiguration(params: {
    apiKey: string;
    shopId: string;
  }): Promise<ConfigurationTestResult> {
    this.logger.debug('Validating configuration', { shopId: params.shopId });

    try {
      // Create API client for testing
      const apiClient = new PrintifyApiClient({
        apiKey: params.apiKey,
        shopId: params.shopId,
      });

      // Test connection by fetching shop information
      const shopInfo = await apiClient.getShop();

      this.logger.debug('Configuration validation successful', { 
        shopId: params.shopId,
        shopTitle: shopInfo.title 
      });

      return {
        success: true,
        shop_info: {
          id: shopInfo.id,
          title: shopInfo.title,
          sales_channel: shopInfo.sales_channel,
        },
      };
    } catch (error) {
      this.logger.warn('Configuration validation failed', { 
        shopId: params.shopId,
        error: (error as Error).message 
      });

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check if store has valid configuration
   */
  async hasValidConfiguration(storeId: string): Promise<boolean> {
    try {
      const configuration = await this.getConfiguration(storeId);
      if (!configuration) {
        return false;
      }

      const testResult = await this.validateConfiguration({
        apiKey: configuration.getApiKey(),
        shopId: configuration.printify_shop_id,
      });

      return testResult.success;
    } catch (error) {
      this.logger.error('Error checking configuration validity', error as Error, { storeId });
      return false;
    }
  }

  /**
   * Get all configurations (for admin overview)
   */
  async getAllConfigurations(): Promise<PrintifyConfiguration[]> {
    this.logger.info('Getting all configurations');

    try {
      // In a real implementation, this would query database for all configs
      // For now, return empty array
      return [];
    } catch (error) {
      this.logger.error('Failed to get all configurations', error as Error);
      throw ErrorFactory.databaseError('Failed to retrieve configurations', error as Error);
    }
  }
}