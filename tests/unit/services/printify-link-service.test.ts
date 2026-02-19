import PrintifyModuleService from '../../../src/modules/printify/service';

// Mock the MedusaService factory so we can instantiate without a real DB
jest.mock('@medusajs/framework/utils', () => {
  return {
    MedusaService: () => class MockBase {},
    Modules: {
      PRODUCT: 'productService',
      ORDER: 'orderService',
    },
    ContainerRegistrationKeys: {
      QUERY: 'query',
    },
    model: {
      define: jest.fn().mockReturnValue({}),
      id: jest.fn().mockReturnValue({ primaryKey: jest.fn() }),
      text: jest.fn().mockReturnValue({ nullable: jest.fn(), unique: jest.fn(), default: jest.fn() }),
      boolean: jest.fn().mockReturnValue({ default: jest.fn() }),
      number: jest.fn().mockReturnValue({ default: jest.fn().mockReturnValue({ nullable: jest.fn() }), nullable: jest.fn().mockReturnValue({ default: jest.fn() }) }),
      json: jest.fn().mockReturnValue({ nullable: jest.fn() }),
      dateTime: jest.fn().mockReturnValue({ nullable: jest.fn() }),
    },
    Module: jest.fn(),
  };
});

describe('PrintifyModuleService — Link Methods', () => {
  let service: any;
  let mockLink: any;
  let mockProductService: any;
  let mockQuery: any;
  let productStore: Map<string, any>;

  beforeEach(() => {
    service = new PrintifyModuleService({} as any, {} as any);
    productStore = new Map();

    mockLink = {
      create: jest.fn().mockResolvedValue(undefined),
      dismiss: jest.fn().mockResolvedValue(undefined),
    };

    mockProductService = {
      createProducts: jest.fn().mockImplementation(async (data: any[]) => {
        return data.map((d, i) => ({ id: `medusa-prod-${i + 1}`, ...d }));
      }),
      retrieveProduct: jest.fn().mockResolvedValue(null),
      deleteProducts: jest.fn().mockResolvedValue(undefined),
    };

    mockQuery = {
      graph: jest.fn(),
    };

    // Wire up the container
    (service as any).__container__ = {
      resolve: (key: string) => {
        if (key === 'link') return mockLink;
        if (key === 'productService') return mockProductService;
        if (key === 'query') return mockQuery;
        return undefined;
      },
    };

    // Mock CRUD methods
    let counter = 0;
    service.updatePrintifyProducts = jest.fn().mockImplementation(async (data: any[]) => {
      return data.map((d) => {
        const existing = productStore.get(d.id);
        if (existing) {
          const updated = { ...existing, ...d, updated_at: new Date() };
          productStore.set(d.id, updated);
          return updated;
        }
        return { ...d, updated_at: new Date() };
      });
    });

    service.retrievePrintifyProduct = jest.fn().mockImplementation(async (id: string) => {
      const product = productStore.get(id);
      if (!product) throw new Error('Not found');
      return product;
    });

    service.createPrintifyProducts = jest.fn().mockImplementation(async (data: any[]) => {
      return data.map((d) => {
        const product = { id: `prod_${++counter}`, ...d, created_at: new Date(), updated_at: new Date() };
        productStore.set(product.id, product);
        return product;
      });
    });

    service.listPrintifyProducts = jest.fn().mockResolvedValue([]);
    service.listAndCountPrintifyProducts = jest.fn().mockResolvedValue([[], 0]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('linkProductToMedusa', () => {
    it('should create link and update text field', async () => {
      productStore.set('pp-1', { id: 'pp-1', title: 'Test', medusa_product_id: null });

      await service.linkProductToMedusa('pp-1', 'medusa-p-1');

      expect(mockLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          printify: { printify_product_id: 'pp-1' },
          productService: { product_id: 'medusa-p-1' },
        })
      );

      expect(service.updatePrintifyProducts).toHaveBeenCalledWith([
        { id: 'pp-1', medusa_product_id: 'medusa-p-1' },
      ]);
    });
  });

  describe('unlinkProductFromMedusa', () => {
    it('should dismiss link and clear text field', async () => {
      productStore.set('pp-2', { id: 'pp-2', title: 'Test2', medusa_product_id: 'medusa-p-2' });

      await service.unlinkProductFromMedusa('pp-2');

      expect(mockLink.dismiss).toHaveBeenCalledWith(
        expect.objectContaining({
          printify: { printify_product_id: 'pp-2' },
        })
      );

      expect(service.updatePrintifyProducts).toHaveBeenCalledWith([
        { id: 'pp-2', medusa_product_id: null },
      ]);
    });

    it('should handle missing link gracefully', async () => {
      mockLink.dismiss.mockRejectedValue(new Error('Link not found'));

      await expect(service.unlinkProductFromMedusa('pp-3')).resolves.not.toThrow();

      // Should still clear the text field
      expect(service.updatePrintifyProducts).toHaveBeenCalledWith([
        { id: 'pp-3', medusa_product_id: null },
      ]);
    });
  });

  describe('createMedusaProductFromPrintify', () => {
    it('should create product with correct title, images, tags, and metadata', async () => {
      const printifyProduct = {
        id: 'pp-1',
        printify_product_id: 'printify-123',
        title: 'Cool T-Shirt',
        description: 'A cool shirt',
        images: [
          { src: 'https://example.com/img1.jpg' },
          { src: 'https://example.com/img2.jpg' },
        ],
        tags: ['clothing', 'tshirt'],
      };

      const result = await service.createMedusaProductFromPrintify(printifyProduct);

      expect(result.id).toBe('medusa-prod-1');
      expect(mockProductService.createProducts).toHaveBeenCalledWith([
        expect.objectContaining({
          title: 'Cool T-Shirt',
          description: 'A cool shirt',
          status: 'published',
          images: [
            { url: 'https://example.com/img1.jpg', rank: 0 },
            { url: 'https://example.com/img2.jpg', rank: 1 },
          ],
          tags: [{ value: 'clothing' }, { value: 'tshirt' }],
          metadata: {
            printify_product_id: 'printify-123',
            printify_auto_created: true,
          },
        }),
      ]);
    });

    it('should handle empty images and tags', async () => {
      const printifyProduct = {
        id: 'pp-2',
        title: 'Plain Product',
        description: '',
        images: null,
        tags: null,
      };

      await service.createMedusaProductFromPrintify(printifyProduct);

      expect(mockProductService.createProducts).toHaveBeenCalledWith([
        expect.objectContaining({
          images: [],
          tags: [],
        }),
      ]);
    });

    it('should handle string image URLs', async () => {
      const printifyProduct = {
        id: 'pp-3',
        title: 'String Images',
        images: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
        tags: [],
      };

      await service.createMedusaProductFromPrintify(printifyProduct);

      expect(mockProductService.createProducts).toHaveBeenCalledWith([
        expect.objectContaining({
          images: [
            { url: 'https://example.com/a.jpg', rank: 0 },
            { url: 'https://example.com/b.jpg', rank: 1 },
          ],
        }),
      ]);
    });
  });

  describe('getProductWithMedusaData', () => {
    it('should use query.graph with correct params', async () => {
      mockQuery.graph.mockResolvedValue({
        data: [{
          id: 'pp-1',
          title: 'Test',
          product: { id: 'medusa-p-1', handle: 'test', thumbnail: null, status: 'published' },
        }],
      });

      const result = await service.getProductWithMedusaData('pp-1');

      expect(mockQuery.graph).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'printify_product',
          filters: { id: 'pp-1' },
        })
      );
      expect(result.id).toBe('pp-1');
      expect(result.product.id).toBe('medusa-p-1');
    });

    it('should fall back to getProductById on error', async () => {
      mockQuery.graph.mockRejectedValue(new Error('Graph error'));
      productStore.set('pp-2', { id: 'pp-2', title: 'Fallback Product' });

      const result = await service.getProductWithMedusaData('pp-2');

      expect(result.id).toBe('pp-2');
      expect(result.title).toBe('Fallback Product');
    });
  });

  describe('getOrderWithMedusaData', () => {
    it('should use query.graph with correct params', async () => {
      mockQuery.graph.mockResolvedValue({
        data: [{
          id: 'order-1',
          status: 'pending',
          order: { id: 'medusa-o-1', display_id: '1001', status: 'pending', email: 'test@example.com' },
        }],
      });

      const result = await service.getOrderWithMedusaData('order-1');

      expect(mockQuery.graph).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'printify_order',
          filters: { id: 'order-1' },
        })
      );
      expect(result.order.display_id).toBe('1001');
    });

    it('should fall back to getOrderBridge on error', async () => {
      mockQuery.graph.mockRejectedValue(new Error('Graph error'));

      // Mock retrievePrintifyOrder for the getOrderBridge fallback
      service.retrievePrintifyOrder = jest.fn().mockResolvedValue({
        id: 'order-2',
        medusa_order_id: 'medusa-o-2',
        status: 'pending',
        total_price: 1000,
        line_items: [],
        shipping_address: {},
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.getOrderWithMedusaData('order-2');

      expect(result).toBeDefined();
      // The fallback returns a PrintifyOrderBridge
      expect(result.id).toBe('order-2');
    });
  });

  describe('enableProduct with linking', () => {
    it('should create Medusa product and link when no existing link', async () => {
      const product = {
        id: 'pp-10',
        title: 'Enable Me',
        description: 'desc',
        configuration_id: 'config-1',
        enabled: false,
        medusa_product_id: null,
        images: [],
        tags: [],
      };
      productStore.set('pp-10', product);

      await service.enableProduct('pp-10', 'admin', 'test');

      expect(mockProductService.createProducts).toHaveBeenCalled();
      expect(mockLink.create).toHaveBeenCalled();
      expect(service.updatePrintifyProducts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'pp-10', enabled: true }),
        ])
      );
    });

    it('should skip linking when already linked', async () => {
      const product = {
        id: 'pp-11',
        title: 'Already Linked',
        description: 'desc',
        configuration_id: 'config-1',
        enabled: false,
        medusa_product_id: 'existing-medusa-id',
        images: [],
        tags: [],
      };
      productStore.set('pp-11', product);

      await service.enableProduct('pp-11', 'admin', 'test');

      expect(mockProductService.createProducts).not.toHaveBeenCalled();
    });
  });

  describe('disableProduct with unlinking', () => {
    it('should unlink and delete auto-created product', async () => {
      const product = {
        id: 'pp-20',
        title: 'Disable Me',
        description: 'desc',
        configuration_id: 'config-1',
        enabled: true,
        medusa_product_id: 'medusa-auto-1',
        images: [],
        tags: [],
      };
      productStore.set('pp-20', product);

      mockProductService.retrieveProduct.mockResolvedValue({
        id: 'medusa-auto-1',
        metadata: { printify_auto_created: true },
      });

      await service.disableProduct('pp-20', 'admin', 'test');

      expect(mockProductService.deleteProducts).toHaveBeenCalledWith(['medusa-auto-1']);
      expect(mockLink.dismiss).toHaveBeenCalled();
    });

    it('should keep manually-created product on disable', async () => {
      const product = {
        id: 'pp-21',
        title: 'Manual Link',
        description: 'desc',
        configuration_id: 'config-1',
        enabled: true,
        medusa_product_id: 'medusa-manual-1',
        images: [],
        tags: [],
      };
      productStore.set('pp-21', product);

      mockProductService.retrieveProduct.mockResolvedValue({
        id: 'medusa-manual-1',
        metadata: {},
      });

      await service.disableProduct('pp-21', 'admin', 'test');

      expect(mockProductService.deleteProducts).not.toHaveBeenCalled();
      expect(mockLink.dismiss).toHaveBeenCalled();
    });
  });
});
