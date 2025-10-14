/**
 * Unit Tests: PrintifyConfiguration Model
 * 
 * Tests for the PrintifyConfiguration entity model including
 * validation, encryption handling, and configuration management.
 */

import { PrintifyConfiguration, PrintifyConfigurationData } from '../../../src/modules/printify/models/printify-configuration';

describe('PrintifyConfiguration', () => {
  const mockConfigurationData: PrintifyConfigurationData = {
    id: 'test-config-123',
    store_id: 'store-123',
    printify_api_key: 'encrypted-api-key',
    printify_shop_id: 'shop-456',
    webhook_secret: 'encrypted-webhook-secret',
    sync_enabled: true,
    sync_frequency: 60,
    created_at: new Date('2025-10-10T10:00:00Z'),
    updated_at: new Date('2025-10-10T10:00:00Z'),
  };

  describe('constructor', () => {
    it('should create a configuration instance with valid data', () => {
      const config = new PrintifyConfiguration(mockConfigurationData);
      
      expect(config.id).toBe(mockConfigurationData.id);
      expect(config.store_id).toBe(mockConfigurationData.store_id);
      expect(config.printify_shop_id).toBe(mockConfigurationData.printify_shop_id);
      expect(config.sync_enabled).toBe(mockConfigurationData.sync_enabled);
      expect(config.sync_frequency).toBe(mockConfigurationData.sync_frequency);
      expect(config.created_at).toBe(mockConfigurationData.created_at);
      expect(config.updated_at).toBe(mockConfigurationData.updated_at);
    });

    it('should handle optional webhook secret', () => {
      const dataWithoutWebhook = { ...mockConfigurationData };
      delete dataWithoutWebhook.webhook_secret;
      
      const config = new PrintifyConfiguration(dataWithoutWebhook);
      
      expect(config.getWebhookSecret()).toBeUndefined();
    });
  });

  describe('API key management', () => {
    it('should get the encrypted API key', () => {
      const config = new PrintifyConfiguration(mockConfigurationData);
      
      expect(config.getApiKey()).toBe('encrypted-api-key');
    });

    it('should set a new API key and update timestamp', () => {
      const config = new PrintifyConfiguration(mockConfigurationData);
      const originalUpdatedAt = config.updated_at;
      
      // Wait a tiny bit to ensure timestamp difference
      setTimeout(() => {
        config.setApiKey('new-encrypted-api-key');
        
        expect(config.getApiKey()).toBe('new-encrypted-api-key');
        expect(config.updated_at).not.toBe(originalUpdatedAt);
        expect(config.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 1);
    });
  });

  describe('webhook secret management', () => {
    it('should get the encrypted webhook secret', () => {
      const config = new PrintifyConfiguration(mockConfigurationData);
      
      expect(config.getWebhookSecret()).toBe('encrypted-webhook-secret');
    });

    it('should set a new webhook secret and update timestamp', () => {
      const config = new PrintifyConfiguration(mockConfigurationData);
      const originalUpdatedAt = config.updated_at;
      
      setTimeout(() => {
        config.setWebhookSecret('new-encrypted-webhook-secret');
        
        expect(config.getWebhookSecret()).toBe('new-encrypted-webhook-secret');
        expect(config.updated_at).not.toBe(originalUpdatedAt);
        expect(config.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 1);
    });
  });

  describe('sync settings management', () => {
    it('should update sync enabled status', () => {
      const config = new PrintifyConfiguration(mockConfigurationData);
      const originalUpdatedAt = config.updated_at;
      
      setTimeout(() => {
        config.updateSyncSettings(false);
        
        expect(config.sync_enabled).toBe(false);
        expect(config.updated_at).not.toBe(originalUpdatedAt);
        expect(config.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 1);
    });

    it('should update sync frequency when provided', () => {
      const config = new PrintifyConfiguration(mockConfigurationData);
      
      config.updateSyncSettings(true, 120);
      
      expect(config.sync_enabled).toBe(true);
      expect(config.sync_frequency).toBe(120);
    });

    it('should validate sync frequency range', () => {
      const config = new PrintifyConfiguration(mockConfigurationData);
      
      expect(() => config.updateSyncSettings(true, 4)).toThrow('Sync frequency must be between 5 and 1440 minutes');
      expect(() => config.updateSyncSettings(true, 1441)).toThrow('Sync frequency must be between 5 and 1440 minutes');
      
      // Valid frequencies should not throw
      expect(() => config.updateSyncSettings(true, 5)).not.toThrow();
      expect(() => config.updateSyncSettings(true, 1440)).not.toThrow();
    });
  });

  describe('data serialization', () => {
    it('should convert to plain data object', () => {
      const config = new PrintifyConfiguration(mockConfigurationData);
      const data = config.toData();
      
      expect(data).toEqual(mockConfigurationData);
    });

    it('should preserve all fields in serialization', () => {
      const config = new PrintifyConfiguration(mockConfigurationData);
      config.setApiKey('updated-key');
      config.updateSyncSettings(false, 30);
      
      const data = config.toData();
      
      expect(data.printify_api_key).toBe('updated-key');
      expect(data.sync_enabled).toBe(false);
      expect(data.sync_frequency).toBe(30);
      expect(data.updated_at).toEqual(config.updated_at);
    });
  });

  describe('static factory method', () => {
    it('should create new configuration with required fields', () => {
      const params = {
        store_id: 'store-789',
        printify_api_key: 'api-key-789',
        printify_shop_id: 'shop-789',
      };
      
      const config = PrintifyConfiguration.create(params);
      
      expect(config.store_id).toBe(params.store_id);
      expect(config.getApiKey()).toBe(params.printify_api_key);
      expect(config.printify_shop_id).toBe(params.printify_shop_id);
      expect(config.sync_enabled).toBe(true); // default
      expect(config.sync_frequency).toBe(60); // default
      expect(config.id).toMatch(/^printify_config_\d+$/);
    });

    it('should create configuration with optional fields', () => {
      const params = {
        store_id: 'store-789',
        printify_api_key: 'api-key-789',
        printify_shop_id: 'shop-789',
        webhook_secret: 'webhook-secret-789',
        sync_enabled: false,
        sync_frequency: 120,
      };
      
      const config = PrintifyConfiguration.create(params);
      
      expect(config.getWebhookSecret()).toBe(params.webhook_secret);
      expect(config.sync_enabled).toBe(false);
      expect(config.sync_frequency).toBe(120);
    });

    it('should set creation and update timestamps', () => {
      const config = PrintifyConfiguration.create({
        store_id: 'store-789',
        printify_api_key: 'api-key-789',
        printify_shop_id: 'shop-789',
      });
      
      expect(config.created_at).toBeInstanceOf(Date);
      expect(config.updated_at).toBeInstanceOf(Date);
      expect(config.created_at).toEqual(config.updated_at);
    });
  });
});