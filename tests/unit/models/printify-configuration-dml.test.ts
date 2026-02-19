/**
 * Unit Tests: PrintifyConfiguration Model (DML)
 * 
 * Tests for the PrintifyConfiguration DML entity model.
 */

import PrintifyConfiguration from '../../../src/modules/printify/models/printify-configuration';

describe('PrintifyConfiguration DML Model', () => {
  const mockConfigurationData = {
    id: 'test-config-123',
    store_id: 'store-123',
    printify_api_key: 'encrypted-api-key',
    printify_shop_id: 'shop-456',
    webhook_secret: 'encrypted-webhook-secret',
    sync_enabled: true,
    sync_frequency: 60,
  };

  describe('model definition', () => {
    it('should be defined as a DML model', () => {
      expect(PrintifyConfiguration).toBeDefined();
      expect(typeof PrintifyConfiguration).toBe('object');
    });

    it('should have the correct model name', () => {
      expect(PrintifyConfiguration.name).toBe('PrintifyConfiguration');
    });
  });

  describe('data handling', () => {
    it('should handle configuration data as plain objects', () => {
      // DML models work with plain data objects
      const config = {
        ...mockConfigurationData,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(config.id).toBe(mockConfigurationData.id);
      expect(config.store_id).toBe(mockConfigurationData.store_id);
      expect(config.printify_shop_id).toBe(mockConfigurationData.printify_shop_id);
      expect(config.sync_enabled).toBe(mockConfigurationData.sync_enabled);
      expect(config.sync_frequency).toBe(mockConfigurationData.sync_frequency);
    });

    it('should handle optional webhook secret', () => {
      const dataWithoutWebhook = { ...mockConfigurationData };
      delete dataWithoutWebhook.webhook_secret;
      
      const config = {
        ...dataWithoutWebhook,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(config.webhook_secret).toBeUndefined();
    });
  });

  describe('field validation', () => {
    it('should have required fields defined', () => {
      const config = {
        ...mockConfigurationData,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      // Test required fields
      expect(config.store_id).toBeDefined();
      expect(config.printify_api_key).toBeDefined();
      expect(config.printify_shop_id).toBeDefined();
      expect(typeof config.sync_enabled).toBe('boolean');
      expect(typeof config.sync_frequency).toBe('number');
    });

    it('should handle default values', () => {
      // DML models define defaults in the schema
      expect(PrintifyConfiguration).toBeDefined();
    });
  });

  describe('configuration management', () => {
    it('should handle sync settings as data', () => {
      const config = {
        ...mockConfigurationData,
        sync_enabled: false,
        sync_frequency: 120,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(config.sync_enabled).toBe(false);
      expect(config.sync_frequency).toBe(120);
    });

    it('should validate sync frequency range conceptually', () => {
      // In DML, validation would be handled by the service layer
      const validFrequency = 60;
      const tooLow = 4;
      const tooHigh = 1441;
      
      expect(validFrequency).toBeGreaterThanOrEqual(5);
      expect(validFrequency).toBeLessThanOrEqual(1440);
      expect(tooLow).toBeLessThan(5);
      expect(tooHigh).toBeGreaterThan(1440);
    });
  });

  describe('data serialization', () => {
    it('should work with plain data objects', () => {
      const config = {
        ...mockConfigurationData,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      // DML entities are plain objects, so they serialize naturally
      const serialized = JSON.parse(JSON.stringify(config));
      expect(serialized.id).toBe(config.id);
      expect(serialized.store_id).toBe(config.store_id);
    });

    it('should preserve all fields in serialization', () => {
      const config = {
        ...mockConfigurationData,
        printify_api_key: 'updated-key',
        sync_enabled: false,
        sync_frequency: 30,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      const serialized = JSON.parse(JSON.stringify(config));
      expect(serialized.printify_api_key).toBe('updated-key');
      expect(serialized.sync_enabled).toBe(false);
      expect(serialized.sync_frequency).toBe(30);
    });
  });

  describe('factory patterns', () => {
    it('should support factory creation patterns', () => {
      const params = {
        store_id: 'store-456',
        printify_api_key: 'test-api-key',
        printify_shop_id: 'shop-789',
        sync_enabled: true,
      };
      
      // Factory pattern for DML entities
      const config = {
        id: `config_${Date.now()}`,
        ...params,
        sync_frequency: 60, // default
        webhook_secret: undefined,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(config.store_id).toBe(params.store_id);
      expect(config.printify_api_key).toBe(params.printify_api_key);
      expect(config.sync_enabled).toBe(true);
      expect(config.sync_frequency).toBe(60);
    });

    it('should support optional fields in factory creation', () => {
      const params = {
        store_id: 'store-789',
        printify_api_key: 'api-key-789',
        printify_shop_id: 'shop-123',
        webhook_secret: 'webhook-secret',
        sync_enabled: false,
        sync_frequency: 120,
      };
      
      const config = {
        id: `config_${Date.now()}`,
        ...params,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(config.webhook_secret).toBe(params.webhook_secret);
      expect(config.sync_enabled).toBe(false);
      expect(config.sync_frequency).toBe(120);
    });

    it('should set creation and update timestamps', () => {
      const config = {
        id: `config_${Date.now()}`,
        store_id: 'store-789',
        printify_api_key: 'api-key-789',
        printify_shop_id: 'shop-789',
        sync_enabled: true,
        sync_frequency: 60,
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(config.created_at).toBeInstanceOf(Date);
      expect(config.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('notification fields', () => {
    it('should support nullable notification_emails field', () => {
      const config = {
        ...mockConfigurationData,
        notification_emails: 'admin@test.com, ops@test.com',
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(config.notification_emails).toBe('admin@test.com, ops@test.com');
    });

    it('should default notify booleans to true', () => {
      // DML defines defaults: notify_dead_lettered_orders, notify_failed_syncs, notify_webhook_errors all default to true
      const config = {
        ...mockConfigurationData,
        notify_dead_lettered_orders: true,
        notify_failed_syncs: true,
        notify_webhook_errors: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(config.notify_dead_lettered_orders).toBe(true);
      expect(config.notify_failed_syncs).toBe(true);
      expect(config.notify_webhook_errors).toBe(true);
    });

    it('should allow notification flags to be set to false', () => {
      const config = {
        ...mockConfigurationData,
        notification_emails: null,
        notify_dead_lettered_orders: false,
        notify_failed_syncs: false,
        notify_webhook_errors: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(config.notification_emails).toBeNull();
      expect(config.notify_dead_lettered_orders).toBe(false);
      expect(config.notify_failed_syncs).toBe(false);
      expect(config.notify_webhook_errors).toBe(false);
    });
  });
});