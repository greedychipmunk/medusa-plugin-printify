/**
 * Order Utilities
 *
 * Shared constants and helpers for order processing across
 * the service layer and workflow steps.
 */

import { PrintifyOrderStatus } from "../models/printify-order"

/** Default Printify shipping method ID used when none is specified. */
export const DEFAULT_SHIPPING_METHOD = 1

/** Default maximum submission retries before an order is dead-lettered. */
export const DEFAULT_MAX_ORDER_RETRIES = 3

/**
 * Allowed state transitions for order lifecycle.
 * Terminal states (DELIVERED, CANCELLED) have no outgoing transitions.
 * FAILED can only transition back to PENDING (admin retry).
 */
export const ORDER_TRANSITIONS: Record<PrintifyOrderStatus, PrintifyOrderStatus[]> = {
  [PrintifyOrderStatus.PENDING]:    [PrintifyOrderStatus.VALIDATED, PrintifyOrderStatus.SUBMITTED, PrintifyOrderStatus.CANCELLED, PrintifyOrderStatus.FAILED],
  [PrintifyOrderStatus.VALIDATED]:  [PrintifyOrderStatus.SUBMITTED, PrintifyOrderStatus.CANCELLED, PrintifyOrderStatus.FAILED],
  [PrintifyOrderStatus.SUBMITTED]:  [PrintifyOrderStatus.PROCESSING, PrintifyOrderStatus.CANCELLED, PrintifyOrderStatus.FAILED],
  [PrintifyOrderStatus.PROCESSING]: [PrintifyOrderStatus.SHIPPED, PrintifyOrderStatus.CANCELLED, PrintifyOrderStatus.FAILED],
  [PrintifyOrderStatus.SHIPPED]:    [PrintifyOrderStatus.DELIVERED, PrintifyOrderStatus.CANCELLED],
  [PrintifyOrderStatus.DELIVERED]:  [],
  [PrintifyOrderStatus.CANCELLED]:  [],
  [PrintifyOrderStatus.FAILED]:     [PrintifyOrderStatus.PENDING],
}

export function canTransitionTo(from: PrintifyOrderStatus, to: PrintifyOrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Normalizes a shipping address that may use camelCase (Medusa)
 * or snake_case (Printify/stored) field names into the shape
 * the Printify API expects.
 */
export function normalizePrintifyAddress(addr: Record<string, any>) {
  return {
    first_name: addr.firstName || addr.first_name,
    last_name: addr.lastName || addr.last_name,
    email: addr.email,
    phone: addr.phone || "",
    company: addr.company || "",
    address1: addr.address1,
    address2: addr.address2 || "",
    city: addr.city,
    state_code: addr.state || addr.region || "",
    zip: addr.zip,
    country_code: addr.country || addr.country_code,
  }
}
