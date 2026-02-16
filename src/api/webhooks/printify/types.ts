export type PrintifyWebhookEvent =
  | PrintifyOrderStatusChangedEvent
  | PrintifyOrderShippedEvent
  | PrintifyProductUpdatedEvent

export interface PrintifyOrderStatusChangedEvent {
  type: "order:status-changed"
  resource: {
    id: string
    type: "order"
    data: {
      id: string
      status: string
      shop_id: string
    }
  }
  created_at: string
}

export interface PrintifyOrderShippedEvent {
  type: "order:shipped"
  resource: {
    id: string
    type: "order"
    data: {
      id: string
      status: string
      shop_id: string
      tracking: {
        tracking_number: string
        tracking_url: string
        carrier: string
      }
    }
  }
  created_at: string
}

export interface PrintifyProductUpdatedEvent {
  type: "product:updated"
  resource: {
    id: string
    type: "product"
    data: {
      id: string
      shop_id: string
    }
  }
  created_at: string
}
