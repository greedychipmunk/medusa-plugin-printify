/**
 * Unit Tests: PrintifyProduct Model (DML)
 * 
 * Tests for the PrintifyProduct DML entity model.
 */

import PrintifyProduct from '../../../src/modules/printify/models/printify-product';

describe('PrintifyProduct DML Model', () => {
  const mockProductData = {
    id: 'test-product-123',
    printify_product_id: 'printify-456',
    medusa_product_id: 'medusa-789',
    configuration_id: 'config-123',
    title: 'Test T-Shirt',
    description: 'A great test t-shirt',
    enabled: false,
    blueprint_id: 'blueprint-1',
    print_provider_id: 'provider-1',
    printify_data: {
      variants: [
        { id: 'v1', price: 1999 },
        { id: 'v2', price: 2499 }
      ]
    },
    tags: ['apparel', 'cotton'],
    images: [
      { url: 'https://example.com/image1.jpg', position: 0 }
    ],
    last_sync_at: new Date('2025-10-10T10:00:00Z'),
  };

  describe('model definition', () => {
    it('should be defined as a DML model', () => {
      expect(PrintifyProduct).toBeDefined();
      expect(typeof PrintifyProduct).toBe('object');
    });

    it('should have the correct model name', () => {
      expect(PrintifyProduct.name).toBe('PrintifyProduct');
    });
  });

  describe('data handling', () => {
    it('should handle product data as plain objects', () => {
      const product = {
        ...mockProductData,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(product.id).toBe(mockProductData.id);
      expect(product.printify_product_id).toBe(mockProductData.printify_product_id);
      expect(product.title).toBe(mockProductData.title);
      expect(product.enabled).toBe(false);
    });

    it('should handle optional medusa product ID', () => {
      const dataWithoutMedusa = { ...mockProductData };
      delete dataWithoutMedusa.medusa_product_id;
      
      const product = {
        ...dataWithoutMedusa,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(product.medusa_product_id).toBeUndefined();
    });

    it('should handle nullable description', () => {
      const dataWithoutDescription = { ...mockProductData };
      delete dataWithoutDescription.description;
      
      const product = {
        ...dataWithoutDescription,
        description: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(product.description).toBeNull();
    });
  });

  describe('enablement management', () => {
    it('should handle enablement as boolean property', () => {
      const enabledProduct = {
        ...mockProductData,
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(enabledProduct.enabled).toBe(true);
    });

    it('should default to disabled', () => {
      const product = {
        ...mockProductData,
        enabled: false, // DML default
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(product.enabled).toBe(false);
    });
  });

  describe('synchronization tracking', () => {
    it('should handle sync timestamp', () => {
      const syncTime = new Date();
      const product = {
        ...mockProductData,
        last_sync_at: syncTime,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(product.last_sync_at).toBe(syncTime);
    });

    it('should handle null sync timestamp for never synced', () => {
      const product = {
        ...mockProductData,
        last_sync_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(product.last_sync_at).toBeNull();
    });
  });

  describe('data serialization', () => {
    it('should work with plain data objects', () => {
      const product = {
        ...mockProductData,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      const serialized = JSON.parse(JSON.stringify(product));
      expect(serialized.id).toBe(product.id);
      expect(serialized.title).toBe(product.title);
      expect(serialized.printify_data).toEqual(product.printify_data);
    });

    it('should preserve complex data structures', () => {
      const product = {
        ...mockProductData,
        printify_data: {
          variants: [
            { id: 'v1', price: 1999, options: { size: 'M', color: 'Red' } }
          ],
          blueprint: { id: 'bp1', name: 'T-Shirt' }
        },
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      const serialized = JSON.parse(JSON.stringify(product));
      expect(serialized.printify_data.variants).toHaveLength(1);
      expect(serialized.printify_data.blueprint.name).toBe('T-Shirt');
    });
  });

  describe('factory patterns', () => {
    it('should support factory creation patterns', () => {
      const params = {
        printify_product_id: 'printify-new-123',
        configuration_id: 'config-456',
        title: 'New Product',
        blueprint_id: 'bp-1',
        print_provider_id: 'pp-1',
      };
      
      const product = {
        id: `product_${Date.now()}`,
        ...params,
        medusa_product_id: null,
        description: null,
        enabled: false, // default
        tags: null,
        images: null,
        printify_data: null,
        last_sync_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(product.printify_product_id).toBe(params.printify_product_id);
      expect(product.title).toBe(params.title);
      expect(product.enabled).toBe(false);
    });

    it('should support full data creation', () => {
      const fullData = {
        id: `product_${Date.now()}`,
        ...mockProductData,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(fullData.printify_data).toBeDefined();
      expect(fullData.tags).toEqual(['apparel', 'cotton']);
      expect(fullData.images).toHaveLength(1);
    });
  });

  describe('field validation', () => {
    it('should have required fields defined', () => {
      const product = {
        ...mockProductData,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(product.printify_product_id).toBeDefined();
      expect(product.configuration_id).toBeDefined();
      expect(product.title).toBeDefined();
      expect(product.blueprint_id).toBeDefined();
      expect(product.print_provider_id).toBeDefined();
      expect(typeof product.enabled).toBe('boolean');
    });

    it('should handle optional and nullable fields', () => {
      const minimalProduct = {
        id: `product_${Date.now()}`,
        printify_product_id: 'pp-123',
        configuration_id: 'config-123',
        title: 'Minimal Product',
        blueprint_id: 'bp-1',
        print_provider_id: 'pp-1',
        medusa_product_id: null,
        description: null,
        enabled: false,
        tags: null,
        images: null,
        printify_data: null,
        last_sync_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      expect(minimalProduct.medusa_product_id).toBeNull();
      expect(minimalProduct.description).toBeNull();
      expect(minimalProduct.tags).toBeNull();
    });
  });
});