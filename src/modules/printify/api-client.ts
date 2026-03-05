import axios, { AxiosInstance } from "axios"

export type PrintifyShop = {
  id: string
  title: string
  sales_channel?: string
}

export type PrintifyVariant = {
  id: number
  sku: string
  cost: number
  price: number
  title: string
  is_enabled: boolean
  is_default: boolean
  options: number[]
  quantity?: number
}

export type PrintifyImage = {
  src: string
  position: string
  is_default: boolean
}

export type PrintifyProduct = {
  id: string
  title: string
  description: string
  variants: PrintifyVariant[]
  images: PrintifyImage[]
  print_areas: Record<string, unknown>[]
  is_locked: boolean
}

export type PrintifyAddress = {
  first_name: string
  last_name: string
  email: string
  phone: string
  country: string
  region: string
  address1: string
  address2?: string
  city: string
  zip: string
}

export type PrintifyOrderLineItem = {
  product_id: string
  variant_id: number
  quantity: number
}

export type PrintifyCreateOrderPayload = {
  external_id: string
  label: string
  line_items: PrintifyOrderLineItem[]
  shipping_method: number
  send_shipping_notification: boolean
  address_to: PrintifyAddress
}

export type PrintifyShipment = {
  carrier: string
  number: string
  url: string
  delivered_at: string | null
}

export type PrintifyOrder = {
  id: string
  status: string
  shipping_method: number
  line_items: PrintifyOrderLineItem[]
  address_to: PrintifyAddress
  total_price: number
  total_shipping: number
  total_tax: number
  shipments?: PrintifyShipment[]
}

export type PrintifyWebhook = {
  id: string
  topic: string
  url: string
  shop_id: string
  secret: string
}

export class PrintifyApiClient {
  private client: AxiosInstance

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: "https://api.printify.com/v1",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    })
  }

  async getShops(): Promise<PrintifyShop[]> {
    const { data } = await this.client.get("/shops.json")
    return data
  }

  async getProducts(shopId: string, page = 1, limit = 100): Promise<{ data: PrintifyProduct[]; current_page: number; last_page: number }> {
    const { data } = await this.client.get(`/shops/${shopId}/products.json`, {
      params: { page, limit },
    })
    return data
  }

  async getProduct(shopId: string, productId: string): Promise<PrintifyProduct> {
    const { data } = await this.client.get(`/shops/${shopId}/products/${productId}.json`)
    return data
  }

  async createOrder(shopId: string, payload: PrintifyCreateOrderPayload): Promise<PrintifyOrder> {
    const { data } = await this.client.post(`/shops/${shopId}/orders.json`, payload)
    return data
  }

  async submitOrder(shopId: string, orderId: string): Promise<PrintifyOrder> {
    const { data } = await this.client.post(`/shops/${shopId}/orders/${orderId}/send_to_production.json`)
    return data
  }

  async getOrder(shopId: string, orderId: string): Promise<PrintifyOrder> {
    const { data } = await this.client.get(`/shops/${shopId}/orders/${orderId}.json`)
    return data
  }

  async calculateShipping(shopId: string, payload: { line_items: PrintifyOrderLineItem[]; address_to: PrintifyAddress }): Promise<{ standard: number; express: number; priority: number; printify_express: number; economy: number }> {
    const { data } = await this.client.post(`/shops/${shopId}/orders/shipping.json`, payload)
    return data
  }

  async getWebhooks(shopId: string): Promise<PrintifyWebhook[]> {
    const { data } = await this.client.get(`/shops/${shopId}/webhooks.json`)
    return data
  }

  async createWebhook(shopId: string, topic: string, url: string): Promise<PrintifyWebhook> {
    const { data } = await this.client.post(`/shops/${shopId}/webhooks.json`, { topic, url })
    return data
  }

  async deleteWebhook(shopId: string, webhookId: string): Promise<void> {
    await this.client.delete(`/shops/${shopId}/webhooks/${webhookId}.json`)
  }
}
