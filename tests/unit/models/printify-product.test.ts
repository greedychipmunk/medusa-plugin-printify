/**
 * Unit Tests: PrintifyProduct Model
 * 
 * Tests for the PrintifyProduct entity model including
 * enablement management, synchronization tracking, and data handling.
 */

import { PrintifyProduct, PrintifyProductData } from '../../../src/modules/printify/models/printify-product';

describe('PrintifyProduct', () => {
  const mockProductData: PrintifyProductData = {
    id: 'test-product-123',
    printify_product_id: 'printify-456',
    medusa_product_id: 'medusa-789',
    configuration_id: 'config-123',
    title: 'Test T-Shirt',
    description: 'A great test t-shirt',
    enabled: false,
    printify_data: {
      variants: [
        { id: 1, title: 'Small', price: 2000, sku: 'TST-S', available: true },
        { id: 2, title: 'Medium', price: 2000, sku: 'TST-M', available: true },
        { id: 3, title: 'Large', price: 2500, sku: 'TST-L', available: false },
      ],
      images: [
        { src: 'https://example.com/image1.jpg', alt: 'Front view', position: 1 },
        { src: 'https://example.com/image2.jpg', alt: 'Back view', position: 2 },
      ],
    },
    last_sync_at: new Date('2025-10-10T09:00:00Z'),
    created_at: new Date('2025-10-10T08:00:00Z'),
    updated_at: new Date('2025-10-10T09:00:00Z'),
  };

  describe('constructor', () => {
    it('should create a product instance with valid data', () => {
      const product = new PrintifyProduct(mockProductData);
      
      expect(product.id).toBe(mockProductData.id);
      expect(product.printify_product_id).toBe(mockProductData.printify_product_id);
      expect(product.medusa_product_id).toBe(mockProductData.medusa_product_id);
      expect(product.configuration_id).toBe(mockProductData.configuration_id);
      expect(product.title).toBe(mockProductData.title);
      expect(product.description).toBe(mockProductData.description);
      expect(product.enabled).toBe(mockProductData.enabled);
      expect(product.printify_data).toEqual(mockProductData.printify_data);
      expect(product.last_sync_at).toBe(mockProductData.last_sync_at);
    });

    it('should handle optional fields', () => {
      const dataWithoutOptionals = { ...mockProductData };
      delete dataWithoutOptionals.medusa_product_id;
      delete dataWithoutOptionals.description;
      delete dataWithoutOptionals.last_sync_at;
      
      const product = new PrintifyProduct(dataWithoutOptionals);
      
      expect(product.medusa_product_id).toBeUndefined();
      expect(product.description).toBeUndefined();
      expect(product.last_sync_at).toBeUndefined();
    });
  });

  describe('enablement management', () => {
    it('should enable product and update timestamp', () => {
      const product = new PrintifyProduct(mockProductData);
      const originalUpdatedAt = product.updated_at;
      
      setTimeout(() => {
        product.enable();
        
        expect(product.enabled).toBe(true);
        expect(product.updated_at).not.toBe(originalUpdatedAt);
        expect(product.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 1);
    });

    it('should disable product and update timestamp', () => {
      const enabledProductData = { ...mockProductData, enabled: true };
      const product = new PrintifyProduct(enabledProductData);
      const originalUpdatedAt = product.updated_at;
      
      setTimeout(() => {
        product.disable();
        
        expect(product.enabled).toBe(false);
        expect(product.updated_at).not.toBe(originalUpdatedAt);
        expect(product.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 1);
    });

    it('should toggle product enablement status', () => {
      const product = new PrintifyProduct(mockProductData); // starts disabled
      
      product.toggle();
      expect(product.enabled).toBe(true);
      
      product.toggle();
      expect(product.enabled).toBe(false);
    });
  });

  describe('Medusa product linking', () => {
    it('should link to Medusa product and update timestamp', () => {
      const product = new PrintifyProduct(mockProductData);
      const originalUpdatedAt = product.updated_at;
      
      setTimeout(() => {
        product.linkToMedusaProduct('new-medusa-123');
        
        expect(product.medusa_product_id).toBe('new-medusa-123');
        expect(product.updated_at).not.toBe(originalUpdatedAt);
        expect(product.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 1);
    });

    it('should unlink from Medusa product and update timestamp', () => {
      const product = new PrintifyProduct(mockProductData);
      const originalUpdatedAt = product.updated_at;
      
      setTimeout(() => {
        product.unlinkFromMedusaProduct();
        
        expect(product.medusa_product_id).toBeUndefined();
        expect(product.updated_at).not.toBe(originalUpdatedAt);
        expect(product.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 1);
    });
  });

  describe('Printify data updates', () => {
    it('should update from Printify data and sync timestamp', () => {
      const product = new PrintifyProduct(mockProductData);
      const newPrintifyData = {
        title: 'Updated T-Shirt',
        description: 'Updated description',
        newField: 'additional data',
      };
      
      product.updateFromPrintify(newPrintifyData);
      
      expect(product.title).toBe('Updated T-Shirt');
      expect(product.description).toBe('Updated description');
      expect(product.printify_data.newField).toBe('additional data');
      expect(product.last_sync_at).toBeInstanceOf(Date);
      expect(product.updated_at).toBeInstanceOf(Date);
    });

    it('should merge new data with existing Printify data', () => {
      const product = new PrintifyProduct(mockProductData);
      const originalVariants = product.printify_data.variants;
      
      product.updateFromPrintify({
        new_field: 'new value',
        title: 'Updated Title',
      });
      
      expect(product.printify_data.variants).toEqual(originalVariants); // preserved
      expect(product.printify_data.new_field).toBe('new value'); // added
      expect(product.title).toBe('Updated Title'); // updated
    });
  });

  describe('synchronization tracking', () => {
    it('should detect when product needs sync (no last sync)', () => {
      const dataWithoutSync = { ...mockProductData };
      delete dataWithoutSync.last_sync_at;
      const product = new PrintifyProduct(dataWithoutSync);
      
      expect(product.needsSync()).toBe(true);
    });

    it('should detect when product needs sync (old sync)', () => {
      const oldSyncData = {
        ...mockProductData,
        last_sync_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      };
      const product = new PrintifyProduct(oldSyncData);
      
      expect(product.needsSync(60)).toBe(true); // max age 60 minutes
    });

    it('should detect when product does not need sync (recent sync)', () => {
      const recentSyncData = {
        ...mockProductData,
        last_sync_at: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      };
      const product = new PrintifyProduct(recentSyncData);
      
      expect(product.needsSync(60)).toBe(false); // max age 60 minutes
    });
  });

  describe('variant and image handling', () => {
    it('should get product variants from Printify data', () => {
      const product = new PrintifyProduct(mockProductData);
      const variants = product.getVariants();
      
      expect(variants).toHaveLength(3);
      expect(variants[0]).toMatchObject({ id: 1, title: 'Small', price: 2000 });
      expect(variants[1]).toMatchObject({ id: 2, title: 'Medium', price: 2000 });
      expect(variants[2]).toMatchObject({ id: 3, title: 'Large', price: 2500 });
    });

    it('should get product images from Printify data', () => {
      const product = new PrintifyProduct(mockProductData);
      const images = product.getImages();
      
      expect(images).toHaveLength(2);
      expect(images[0]).toMatchObject({ 
        src: 'https://example.com/image1.jpg', 
        alt: 'Front view', 
        position: 1 
      });
    });

    it('should return empty arrays when no variants/images exist', () => {
      const dataWithoutVariants = {
        ...mockProductData,
        printify_data: {},
      };
      const product = new PrintifyProduct(dataWithoutVariants);
      
      expect(product.getVariants()).toEqual([]);
      expect(product.getImages()).toEqual([]);
    });
  });

  describe('pricing and availability', () => {
    it('should get base price from lowest variant price', () => {
      const product = new PrintifyProduct(mockProductData);
      
      expect(product.getBasePrice()).toBe(2000); // lowest of 2000, 2000, 2500
    });

    it('should return 0 for base price when no variants exist', () => {
      const dataWithoutVariants = {
        ...mockProductData,
        printify_data: {},
      };
      const product = new PrintifyProduct(dataWithoutVariants);
      
      expect(product.getBasePrice()).toBe(0);
    });

    it('should check availability based on variant availability', () => {
      const product = new PrintifyProduct(mockProductData);
      
      expect(product.isAvailable()).toBe(true); // has available variants
    });

    it('should return false for availability when no available variants', () => {
      const dataWithUnavailableVariants = {
        ...mockProductData,
        printify_data: {
          variants: [
            { id: 1, title: 'Small', price: 2000, sku: 'TST-S', available: false },
            { id: 2, title: 'Medium', price: 2000, sku: 'TST-M', available: false },
          ],
        },
      };
      const product = new PrintifyProduct(dataWithUnavailableVariants);
      
      expect(product.isAvailable()).toBe(false);
    });
  });

  describe('data serialization', () => {
    it('should convert to plain data object', () => {
      const product = new PrintifyProduct(mockProductData);
      const data = product.toData();
      
      expect(data).toEqual(mockProductData);
    });

    it('should preserve all changes in serialization', () => {
      const product = new PrintifyProduct(mockProductData);
      product.enable();
      product.linkToMedusaProduct('new-medusa-id');
      product.updateFromPrintify({ title: 'New Title' });
      
      const data = product.toData();
      
      expect(data.enabled).toBe(true);
      expect(data.medusa_product_id).toBe('new-medusa-id');
      expect(data.title).toBe('New Title');
      expect(data.updated_at).toEqual(product.updated_at);
      expect(data.last_sync_at).toEqual(product.last_sync_at);
    });
  });

  describe('static factory method', () => {
    it('should create product from Printify data', () => {
      const printifyData = {
        title: 'Factory T-Shirt',
        description: 'Created from factory',
        variants: [{ id: 1, title: 'Medium', price: 1500 }],
      };
      
      const product = PrintifyProduct.createFromPrintify({
        printify_product_id: 'printify-999',
        configuration_id: 'config-999',
        printifyData,
        enabled: true,
      });
      
      expect(product.printify_product_id).toBe('printify-999');
      expect(product.configuration_id).toBe('config-999');
      expect(product.title).toBe('Factory T-Shirt');
      expect(product.description).toBe('Created from factory');
      expect(product.enabled).toBe(true);
      expect(product.printify_data).toEqual(printifyData);
      expect(product.last_sync_at).toBeInstanceOf(Date);
      expect(product.id).toMatch(/^printify_product_\d+_[a-z0-9]+$/);
    });

    it('should use default values for optional parameters', () => {
      const product = PrintifyProduct.createFromPrintify({
        printify_product_id: 'printify-999',
        configuration_id: 'config-999',
        printifyData: { title: 'Test Product' },
      });
      
      expect(product.enabled).toBe(false); // default
      expect(product.title).toBe('Test Product');
    });

    it('should handle missing title in Printify data', () => {
      const product = PrintifyProduct.createFromPrintify({
        printify_product_id: 'printify-999',
        configuration_id: 'config-999',
        printifyData: { description: 'No title provided' },
      });
      
      expect(product.title).toBe('Untitled Product'); // fallback
    });
  });
});