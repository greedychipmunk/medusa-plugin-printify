# Data Model Design

**Date**: January 9, 2026  
**Status**: Phase 1 Design  
**Context**: Modernization from custom SQL migrations to MedusaJS Data Model Language

## Overview

This document defines the data models for the modernized MedusaJS Printify plugin using MedusaJS Data Model Language (DML) instead of custom SQL migrations. All models will be automatically migrated by MedusaJS framework.

---

## Entity Definitions

### PrintifyConfiguration

**Purpose**: Stores per-store Printify API configuration and settings  
**Relationships**: One-to-many with PrintifyProduct, PrintifyOrder  
**Indexes**: Unique constraint on store_id for single configuration per store

```typescript
import { model } from "@medusajs/framework/utils"

export const PrintifyConfiguration = model.define("printify_configuration", {
  id: model.id().primaryKey(),
  store_id: model.text().index(),
  printify_api_key: model.text(),
  printify_shop_id: model.text(),
  webhook_secret: model.text().nullable(),
  sync_enabled: model.boolean().default(true),
  sync_frequency: model.number().default(60),
  batch_size: model.number().default(100),
  development_mode: model.boolean().default(false),
  webhook_base_url: model.text().nullable(),
  logging_level: model.text().default("info"),
  structured_logging: model.boolean().default(true),
  created_at: model.dateTime().default(() => new Date()),
  updated_at: model.dateTime().default(() => new Date()),
}).indexes([
  {
    name: "IDX_printify_config_store",
    on: ["store_id"],
    unique: true
  }
])
```

**Validation Rules**:
- `printify_api_key`: Required, encrypted at rest
- `printify_shop_id`: Required, must be valid Printify shop ID
- `sync_frequency`: Minimum 10 minutes, maximum 1440 minutes (24 hours)
- `batch_size`: Minimum 10, maximum 500
- `logging_level`: Must be one of: error, warn, info, debug

### PrintifyProduct

**Purpose**: Stores Printify product information and sync state  
**Relationships**: Belongs to PrintifyConfiguration, optional relation to Medusa Product  
**State Management**: Tracks sync status and enablement history

```typescript
export const PrintifyProduct = model.define("printify_product", {
  id: model.id().primaryKey(),
  configuration_id: model.text(),
  printify_product_id: model.text(),
  medusa_product_id: model.text().nullable(),
  title: model.text(),
  description: model.text().nullable(),
  enabled: model.boolean().default(false),
  sync_status: model.text().default("pending"), // pending, synced, failed
  printify_data: model.json(), // Raw Printify API response
  medusa_data: model.json().nullable(), // Transformed Medusa product data
  last_sync_at: model.dateTime().nullable(),
  last_sync_error: model.text().nullable(),
  created_at: model.dateTime().default(() => new Date()),
  updated_at: model.dateTime().default(() => new Date()),
}).indexes([
  {
    name: "IDX_printify_product_printify_id",
    on: ["printify_product_id"],
    unique: true
  },
  {
    name: "IDX_printify_product_medusa_id", 
    on: ["medusa_product_id"]
  },
  {
    name: "IDX_printify_product_config",
    on: ["configuration_id"]
  },
  {
    name: "IDX_printify_product_enabled",
    on: ["enabled"]
  }
])
```

**Validation Rules**:
- `printify_product_id`: Required, unique across all configurations
- `sync_status`: Must be one of: pending, synced, failed
- `printify_data`: Must contain valid Printify product structure
- `medusa_data`: Optional, contains transformed product data for Medusa

### PrintifyProductVariant

**Purpose**: Stores individual product variant information  
**Relationships**: Belongs to PrintifyProduct, optional relation to Medusa ProductVariant

```typescript
export const PrintifyProductVariant = model.define("printify_product_variant", {
  id: model.id().primaryKey(),
  product_id: model.text(), // Reference to PrintifyProduct
  printify_variant_id: model.text(),
  medusa_variant_id: model.text().nullable(),
  sku: model.text().nullable(),
  title: model.text(),
  price: model.number(),
  cost: model.number().nullable(),
  grams: model.number().nullable(),
  enabled: model.boolean().default(false),
  variant_data: model.json(), // Printify variant details (size, color, etc.)
  created_at: model.dateTime().default(() => new Date()),
  updated_at: model.dateTime().default(() => new Date()),
}).indexes([
  {
    name: "IDX_printify_variant_printify_id",
    on: ["printify_variant_id"],
    unique: true
  },
  {
    name: "IDX_printify_variant_product",
    on: ["product_id"]
  },
  {
    name: "IDX_printify_variant_medusa_id",
    on: ["medusa_variant_id"]
  },
  {
    name: "IDX_printify_variant_sku",
    on: ["sku"]
  }
])
```

### PrintifyOrder

**Purpose**: Stores Printify order information and fulfillment status  
**Relationships**: Belongs to PrintifyConfiguration, links to Medusa Order

```typescript
export const PrintifyOrder = model.define("printify_order", {
  id: model.id().primaryKey(),
  configuration_id: model.text(),
  printify_order_id: model.text().nullable(),
  medusa_order_id: model.text(),
  external_id: model.text(), // Medusa order ID as seen by Printify
  status: model.text().default("pending"), // pending, submitted, shipped, delivered, failed
  line_items: model.json(), // Order line items
  shipping_info: model.json(), // Shipping address and method
  printify_response: model.json().nullable(), // Printify API response
  tracking_number: model.text().nullable(),
  tracking_url: model.text().nullable(),
  submitted_at: model.dateTime().nullable(),
  shipped_at: model.dateTime().nullable(),
  delivered_at: model.dateTime().nullable(),
  error_message: model.text().nullable(),
  retry_count: model.number().default(0),
  created_at: model.dateTime().default(() => new Date()),
  updated_at: model.dateTime().default(() => new Date()),
}).indexes([
  {
    name: "IDX_printify_order_printify_id",
    on: ["printify_order_id"]
  },
  {
    name: "IDX_printify_order_medusa_id",
    on: ["medusa_order_id"]
  },
  {
    name: "IDX_printify_order_external_id",
    on: ["external_id"],
    unique: true
  },
  {
    name: "IDX_printify_order_status",
    on: ["status"]
  },
  {
    name: "IDX_printify_order_config",
    on: ["configuration_id"]
  }
])
```

### PrintifyCartItem

**Purpose**: Temporary storage for cart items during checkout process  
**Relationships**: Links to PrintifyProduct and PrintifyProductVariant

```typescript
export const PrintifyCartItem = model.define("printify_cart_item", {
  id: model.id().primaryKey(),
  cart_id: model.text(),
  product_id: model.text(), // PrintifyProduct ID
  variant_id: model.text(), // PrintifyProductVariant ID
  quantity: model.number(),
  unit_price: model.number(),
  total_price: model.number(),
  printify_data: model.json(), // Product customization data
  created_at: model.dateTime().default(() => new Date()),
  updated_at: model.dateTime().default(() => new Date()),
}).indexes([
  {
    name: "IDX_printify_cart_item_cart",
    on: ["cart_id"]
  },
  {
    name: "IDX_printify_cart_item_product",
    on: ["product_id"]
  }
])
```

### ProductEnablementHistory

**Purpose**: Audit trail for product enablement/disablement actions  
**Relationships**: Belongs to PrintifyProduct

```typescript
export const ProductEnablementHistory = model.define("product_enablement_history", {
  id: model.id().primaryKey(),
  product_id: model.text(), // PrintifyProduct ID
  action: model.text(), // enabled, disabled
  reason: model.text().nullable(),
  actor_id: model.text(), // User who performed action
  actor_email: model.text().nullable(),
  previous_state: model.boolean(),
  new_state: model.boolean(),
  created_at: model.dateTime().default(() => new Date()),
}).indexes([
  {
    name: "IDX_enablement_history_product",
    on: ["product_id"]
  },
  {
    name: "IDX_enablement_history_actor",
    on: ["actor_id"]
  },
  {
    name: "IDX_enablement_history_created",
    on: ["created_at"]
  }
])
```

### SyncLog

**Purpose**: Detailed logging for sync operations and debugging  
**Relationships**: Belongs to PrintifyConfiguration

```typescript
export const SyncLog = model.define("sync_log", {
  id: model.id().primaryKey(),
  configuration_id: model.text(),
  operation_type: model.text(), // product_sync, order_submit, webhook_process
  operation_id: model.text().nullable(), // Related entity ID
  status: model.text(), // started, completed, failed
  start_time: model.dateTime(),
  end_time: model.dateTime().nullable(),
  duration_ms: model.number().nullable(),
  records_processed: model.number().default(0),
  records_succeeded: model.number().default(0),
  records_failed: model.number().default(0),
  error_details: model.json().nullable(),
  metadata: model.json().nullable(), // Additional context data
  created_at: model.dateTime().default(() => new Date()),
}).indexes([
  {
    name: "IDX_sync_log_config",
    on: ["configuration_id"]
  },
  {
    name: "IDX_sync_log_operation",
    on: ["operation_type", "operation_id"]
  },
  {
    name: "IDX_sync_log_status",
    on: ["status"]
  },
  {
    name: "IDX_sync_log_created",
    on: ["created_at"]
  }
])
```

---

## Entity Relationships

### Relationship Definitions

```typescript
// PrintifyConfiguration relationships
PrintifyConfiguration.hasMany(() => PrintifyProduct, {
  foreignKey: "configuration_id"
})
PrintifyConfiguration.hasMany(() => PrintifyOrder, {
  foreignKey: "configuration_id"
})
PrintifyConfiguration.hasMany(() => SyncLog, {
  foreignKey: "configuration_id"
})

// PrintifyProduct relationships
PrintifyProduct.belongsTo(() => PrintifyConfiguration, {
  foreignKey: "configuration_id"
})
PrintifyProduct.hasMany(() => PrintifyProductVariant, {
  foreignKey: "product_id"
})
PrintifyProduct.hasMany(() => ProductEnablementHistory, {
  foreignKey: "product_id"
})

// PrintifyProductVariant relationships
PrintifyProductVariant.belongsTo(() => PrintifyProduct, {
  foreignKey: "product_id"
})

// PrintifyOrder relationships
PrintifyOrder.belongsTo(() => PrintifyConfiguration, {
  foreignKey: "configuration_id"
})

// CartItem relationships
PrintifyCartItem.belongsTo(() => PrintifyProduct, {
  foreignKey: "product_id"
})
PrintifyCartItem.belongsTo(() => PrintifyProductVariant, {
  foreignKey: "variant_id"
})

// Audit relationships
ProductEnablementHistory.belongsTo(() => PrintifyProduct, {
  foreignKey: "product_id"
})
SyncLog.belongsTo(() => PrintifyConfiguration, {
  foreignKey: "configuration_id"
})
```

---

## Migration Strategy

### **Phase 1**: Model Creation
1. Create new data model definitions
2. Generate automatic migrations via `npx medusa db:generate`
3. Run migrations in development environment
4. Verify table structures match requirements

### **Phase 2**: Data Migration
1. Create data migration script to transfer existing data
2. Map legacy table structures to new models
3. Validate data integrity after migration
4. Update foreign key relationships

### **Phase 3**: Legacy Cleanup
1. Remove custom migration files from `src/modules/printify/migrations/`
2. Update service layer to use new model methods
3. Test all CRUD operations with new models
4. Update integration tests

### **Phase 4**: Validation
1. Comprehensive testing of all data operations
2. Performance testing with large datasets
3. Backup and restore procedures
4. Documentation updates

---

## Performance Considerations

### **Indexing Strategy**
- Primary keys on all entities for fast lookups
- Foreign key indexes for relationship queries  
- Composite indexes for common query patterns
- Unique constraints where business rules require

### **Query Optimization**
- Eager loading for related data when needed
- Pagination for large result sets
- Caching for frequently accessed configuration data
- Batch operations for sync processes

### **Data Retention**
- Automatic cleanup of old sync logs (configurable retention period)
- Archival strategy for completed orders
- Soft deletes for audit trail preservation

This data model design provides a solid foundation for the modernized plugin while maintaining compatibility with existing functionality and enabling future enhancements.