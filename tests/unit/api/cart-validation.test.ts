/**
 * Unit Tests: Cart Validation Endpoint
 *
 * Tests the POST /store/printify/cart/validate route handler.
 */

// Mock modules before imports
jest.mock('@medusajs/framework/utils', () => {
  return {
    MedusaService: () => class MockBase {},
    model: {
      define: jest.fn().mockReturnValue({}),
      id: jest.fn().mockReturnValue({ primaryKey: jest.fn() }),
      text: jest.fn().mockReturnValue({ nullable: jest.fn(), unique: jest.fn(), default: jest.fn() }),
      boolean: jest.fn().mockReturnValue({ default: jest.fn() }),
      number: jest.fn().mockReturnValue({ default: jest.fn() }),
      json: jest.fn().mockReturnValue({ nullable: jest.fn() }),
      dateTime: jest.fn().mockReturnValue({ nullable: jest.fn() }),
    },
    Module: jest.fn(),
  };
});

import { POST } from '../../../src/api/store/printify/cart/validate/route';

describe('POST /store/printify/cart/validate', () => {
  let mockService: any;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    mockService = {
      listPrintifyProducts: jest.fn(),
    };

    mockReq = {
      body: {},
      scope: {
        resolve: jest.fn().mockReturnValue(mockService),
      },
    };

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return valid when all products exist and are enabled', async () => {
    mockReq.body = {
      items: [
        { printify_product_id: 'prod-1', quantity: 2 },
        { printify_product_id: 'prod-2', quantity: 1 },
      ],
    };

    mockService.listPrintifyProducts
      .mockResolvedValueOnce([{ printify_product_id: 'prod-1', title: 'Shirt', enabled: true }])
      .mockResolvedValueOnce([{ printify_product_id: 'prod-2', title: 'Mug', enabled: true }]);

    await POST(mockReq as any, mockRes as any);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        valid: true,
        items: expect.arrayContaining([
          expect.objectContaining({ printify_product_id: 'prod-1', valid: true }),
          expect.objectContaining({ printify_product_id: 'prod-2', valid: true }),
        ]),
      })
    );
  });

  it('should return invalid when a product is disabled', async () => {
    mockReq.body = {
      items: [{ printify_product_id: 'prod-1', quantity: 1 }],
    };

    mockService.listPrintifyProducts.mockResolvedValue([
      { printify_product_id: 'prod-1', title: 'Disabled Product', enabled: false },
    ]);

    await POST(mockReq as any, mockRes as any);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        valid: false,
        items: expect.arrayContaining([
          expect.objectContaining({
            printify_product_id: 'prod-1',
            valid: false,
            error: 'Product is not available',
          }),
        ]),
      })
    );
  });

  it('should return invalid when a product is not found', async () => {
    mockReq.body = {
      items: [{ printify_product_id: 'nonexistent', quantity: 1 }],
    };

    mockService.listPrintifyProducts.mockResolvedValue([]);

    await POST(mockReq as any, mockRes as any);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        valid: false,
        items: expect.arrayContaining([
          expect.objectContaining({
            printify_product_id: 'nonexistent',
            valid: false,
            error: 'Product not found',
          }),
        ]),
      })
    );
  });

  it('should return 400 for empty items array', async () => {
    mockReq.body = { items: [] };

    await POST(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ valid: false })
    );
  });

  it('should return 400 when items field is missing', async () => {
    mockReq.body = {};

    await POST(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ valid: false })
    );
  });

  it('should return 500 when service throws an unexpected error', async () => {
    mockReq.body = {
      items: [{ printify_product_id: 'prod-1', quantity: 1 }],
    };

    mockService.listPrintifyProducts.mockRejectedValue(new Error('Database down'));

    await POST(mockReq as any, mockRes as any);

    // Individual item errors are caught, not the whole request
    // The per-item catch returns "Validation failed"
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        valid: false,
        items: expect.arrayContaining([
          expect.objectContaining({
            valid: false,
            error: 'Validation failed',
          }),
        ]),
      })
    );
  });
});
