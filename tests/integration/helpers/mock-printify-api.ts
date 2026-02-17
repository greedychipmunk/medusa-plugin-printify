/**
 * Mock Printify API
 *
 * Provides realistic Printify API response fixtures and a helper
 * to configure axios.create to return a controlled mock instance.
 */

import axios from "axios"

// ── Fixtures ───────────────────────────────────────────────────────

export const PRINTIFY_SHOP = {
  id: 12345,
  title: "Test Shop",
  sales_channel: "custom_integration",
}

export const PRINTIFY_PRODUCT_1 = {
  id: "prod_abc123",
  title: "Classic T-Shirt",
  description: "A comfortable cotton t-shirt",
  tags: ["apparel", "t-shirt"],
  options: [{ name: "Size", type: "size", values: [{ id: 1, title: "S" }, { id: 2, title: "M" }] }],
  variants: [
    { id: 1001, sku: "TSH-S", cost: 800, price: 2500, title: "Small", grams: 200, is_enabled: true, is_default: true, is_available: true, options: [1] },
    { id: 1002, sku: "TSH-M", cost: 800, price: 2500, title: "Medium", grams: 220, is_enabled: true, is_default: false, is_available: true, options: [2] },
  ],
  images: [{ src: "https://images.printify.com/tshirt.jpg", variant_ids: [1001, 1002], position: "front", is_default: true }],
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-06-01T00:00:00Z",
  visible: true,
  is_locked: false,
  blueprint_id: 5,
  user_id: 1,
  shop_id: 12345,
}

export const PRINTIFY_PRODUCT_2 = {
  id: "prod_def456",
  title: "Canvas Mug",
  description: "Ceramic mug with custom print",
  tags: ["drinkware", "mug"],
  options: [],
  variants: [
    { id: 2001, sku: "MUG-11", cost: 500, price: 1800, title: "11oz", grams: 350, is_enabled: true, is_default: true, is_available: true, options: [] },
  ],
  images: [{ src: "https://images.printify.com/mug.jpg", variant_ids: [2001], position: "front", is_default: true }],
  created_at: "2025-02-01T00:00:00Z",
  updated_at: "2025-06-15T00:00:00Z",
  visible: true,
  is_locked: false,
  blueprint_id: 12,
  user_id: 1,
  shop_id: 12345,
}

export const PRINTIFY_PRODUCT_3 = {
  id: "prod_ghi789",
  title: "Tote Bag",
  description: "Eco-friendly tote bag",
  tags: ["accessories", "bag"],
  options: [],
  variants: [
    { id: 3001, sku: "TOTE-1", cost: 600, price: 2000, title: "Standard", grams: 300, is_enabled: true, is_default: true, is_available: true, options: [] },
  ],
  images: [{ src: "https://images.printify.com/tote.jpg", variant_ids: [3001], position: "front", is_default: true }],
  created_at: "2025-03-01T00:00:00Z",
  updated_at: "2025-07-01T00:00:00Z",
  visible: true,
  is_locked: false,
  blueprint_id: 20,
  user_id: 1,
  shop_id: 12345,
}

export const PRINTIFY_PRODUCTS_PAGE_1 = {
  data: [PRINTIFY_PRODUCT_1, PRINTIFY_PRODUCT_2],
  current_page: 1,
  last_page: 2,
  total: 3,
}

export const PRINTIFY_PRODUCTS_PAGE_2 = {
  data: [PRINTIFY_PRODUCT_3],
  current_page: 2,
  last_page: 2,
  total: 3,
}

export const PRINTIFY_PRODUCTS_SINGLE_PAGE = {
  data: [PRINTIFY_PRODUCT_1, PRINTIFY_PRODUCT_2],
  current_page: 1,
  last_page: 1,
  total: 2,
}

export const PRINTIFY_ORDER_RESPONSE = {
  id: "printify_order_001",
  status: "pending",
  created_at: "2025-06-01T12:00:00Z",
}

export const PRINTIFY_ORDER_IN_PRODUCTION = {
  id: "printify_order_001",
  status: "in-production",
  tracking: null,
}

export const PRINTIFY_ORDER_SHIPPED = {
  id: "printify_order_001",
  status: "shipped",
  tracking: {
    tracking_number: "1Z999AA10123456784",
    tracking_url: "https://tracking.example.com/1Z999AA10123456784",
    carrier: "UPS",
  },
}

export const PRINTIFY_ORDER_DELIVERED = {
  id: "printify_order_001",
  status: "delivered",
  tracking: {
    tracking_number: "1Z999AA10123456784",
    tracking_url: "https://tracking.example.com/1Z999AA10123456784",
    carrier: "UPS",
  },
}

export const PRINTIFY_SHIPPING_RATES = [
  { id: 1, name: "Standard Shipping", cost: 499, currency: "USD", estimated_delivery_min: 5, estimated_delivery_max: 10 },
  { id: 2, name: "Express Shipping", cost: 999, currency: "USD", estimated_delivery_min: 2, estimated_delivery_max: 4 },
]

export const PRINTIFY_PRODUCT_UPDATED = {
  ...PRINTIFY_PRODUCT_1,
  title: "Classic T-Shirt V2",
  description: "Updated description",
  updated_at: "2026-01-15T00:00:00Z",
}

// ── Axios Mock Helper ──────────────────────────────────────────────

export interface MockAxiosInstance {
  get: jest.Mock
  post: jest.Mock
  put: jest.Mock
  delete: jest.Mock
  interceptors: {
    request: { use: jest.Mock }
    response: { use: jest.Mock }
  }
}

export function setupAxiosMock(): MockAxiosInstance {
  const mockInstance: MockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  }

  ;(axios.create as jest.Mock).mockReturnValue(mockInstance)

  return mockInstance
}
