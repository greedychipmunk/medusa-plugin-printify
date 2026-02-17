export type ActivityStatus = "success" | "failed" | "running" | "idle"

export interface ProductSyncActivity {
  last_sync_at?: Date
  last_sync_status: ActivityStatus
  last_sync_duration_ms?: number
  products_synced: number
  products_failed: number
  error_message?: string
}

export interface OrderAutoSubmitActivity {
  last_run_at?: Date
  last_run_status: ActivityStatus
  orders_submitted: number
  orders_failed: number
  error_message?: string
}

export interface AutomationActivity {
  configuration_id: string
  product_sync: ProductSyncActivity
  order_auto_submit: OrderAutoSubmitActivity
  updated_at: Date
}

function defaultProductSync(): ProductSyncActivity {
  return {
    last_sync_status: "idle",
    products_synced: 0,
    products_failed: 0,
  }
}

function defaultOrderAutoSubmit(): OrderAutoSubmitActivity {
  return {
    last_run_status: "idle",
    orders_submitted: 0,
    orders_failed: 0,
  }
}

class AutomationActivityStore {
  private activities = new Map<string, AutomationActivity>()

  get(configId: string): AutomationActivity {
    let activity = this.activities.get(configId)
    if (!activity) {
      activity = {
        configuration_id: configId,
        product_sync: defaultProductSync(),
        order_auto_submit: defaultOrderAutoSubmit(),
        updated_at: new Date(),
      }
      this.activities.set(configId, activity)
    }
    return activity
  }

  updateProductSync(configId: string, partial: Partial<ProductSyncActivity>): void {
    const activity = this.get(configId)
    Object.assign(activity.product_sync, partial)
    activity.updated_at = new Date()
  }

  updateOrderAutoSubmit(configId: string, partial: Partial<OrderAutoSubmitActivity>): void {
    const activity = this.get(configId)
    Object.assign(activity.order_auto_submit, partial)
    activity.updated_at = new Date()
  }

  reset(configId: string): void {
    this.activities.delete(configId)
  }
}

export const automationActivityStore = new AutomationActivityStore()
