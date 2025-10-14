# Data Model: Medusa Printify Integration Plugin

**Feature**: Medusa Printify Integration Plugin  
**Created**: 2025-10-10  
**Purpose**: Define data structures and relationships for Printify integration

## Core Entities

### PrintifyConfiguration

Stores plugin configuration and API credentials for Printify integration.

**Fields**:
- `id`: string (UUID, primary key)
- `store_id`: string (Medusa store identifier)
- `printify_api_key`: string (encrypted Printify API key)
- `printify_shop_id`: string (Printify shop identifier)
- `webhook_secret`: string (encrypted webhook verification secret)
- `sync_enabled`: boolean (automatic synchronization enabled)
- `sync_frequency`: number (sync interval in minutes)
- `created_at`: timestamp
- `updated_at`: timestamp

**Relationships**:
- One-to-many with `PrintifyProduct`
- One-to-many with `SyncLog`

**Validation Rules**:
- `printify_api_key` must be valid Printify API token format
- `sync_frequency` must be between 5 and 1440 minutes
- `webhook_secret` required when `sync_enabled` is true

### PrintifyProduct

Represents a Printify product and its enablement status in the Medusa store.

**Fields**:
- `id`: string (UUID, primary key)
- `printify_product_id`: string (Printify product ID)
- `medusa_product_id`: string (optional, Medusa product ID if synchronized)
- `configuration_id`: string (foreign key to PrintifyConfiguration)
- `title`: string (product title from Printify)
- `description`: text (product description)
- `enabled`: boolean (product enabled for storefront)
- `printify_data`: json (cached Printify product data)
- `last_sync_at`: timestamp (last synchronization time)
- `created_at`: timestamp
- `updated_at`: timestamp

**Relationships**:
- Many-to-one with `PrintifyConfiguration`
- One-to-one with Medusa `Product` (optional)
- One-to-many with `SyncLog`

**Validation Rules**:
- `printify_product_id` must be unique within configuration
- `enabled` defaults to false (require explicit enablement)
- `printify_data` must conform to Printify API schema

**State Transitions**:
- New → Disabled (initial state)
- Disabled → Enabled (admin enables product)
- Enabled → Disabled (admin disables or sync failure)
- Any → Syncing (during synchronization)

### SyncLog

Records synchronization activities and errors for troubleshooting and audit.

**Fields**:
- `id`: string (UUID, primary key)
- `configuration_id`: string (foreign key to PrintifyConfiguration)
- `printify_product_id`: string (optional, specific product sync)
- `sync_type`: enum (manual, scheduled, webhook, bulk)
- `status`: enum (success, failure, partial)
- `operation`: enum (fetch, update, enable, disable)
- `error_message`: text (optional, error details)
- `changes_count`: number (number of products affected)
- `duration_ms`: number (sync operation duration)
- `created_at`: timestamp

**Relationships**:
- Many-to-one with `PrintifyConfiguration`
- Many-to-one with `PrintifyProduct` (optional)

**Validation Rules**:
- `sync_type` must be valid enum value
- `duration_ms` must be positive integer
- `error_message` required when status is failure

### ProductEnablementHistory

Tracks changes to product enablement status for audit purposes.

**Fields**:
- `id`: string (UUID, primary key)
- `printify_product_id`: string (foreign key to PrintifyProduct)
- `admin_user_id`: string (Medusa admin user who made change)
- `previous_status`: boolean (previous enablement status)
- `new_status`: boolean (new enablement status)
- `reason`: string (optional, reason for change)
- `ip_address`: string (admin user IP address)
- `user_agent`: string (admin user browser/client)
- `created_at`: timestamp

**Relationships**:
- Many-to-one with `PrintifyProduct`
- Many-to-one with Medusa `User`

**Validation Rules**:
- `previous_status` and `new_status` must be different
- `admin_user_id` must reference valid Medusa user
- `ip_address` must be valid IPv4 or IPv6 format

## Database Schema Design

### Indexing Strategy
- Primary keys: Clustered indexes on all UUID primary keys
- Foreign keys: Non-clustered indexes on all foreign key fields
- Query optimization: Composite index on (`configuration_id`, `enabled`) for PrintifyProduct
- Audit queries: Index on `created_at` for SyncLog and ProductEnablementHistory

### Data Integrity Constraints
- Cascade delete: Removing PrintifyConfiguration removes related records
- Referential integrity: Foreign keys enforce valid relationships
- Unique constraints: `printify_product_id` unique within configuration scope
- Check constraints: Enum fields limited to valid values

### Migration Strategy
- Incremental migrations for schema changes
- Backward compatibility for at least 2 plugin versions
- Data migration scripts for major schema updates
- Rollback procedures for failed migrations

## Integration with Medusa Core

### Product Synchronization
- Create Medusa `Product` records for enabled Printify products
- Maintain bidirectional mapping between Printify and Medusa products
- Sync product variants, images, and pricing data
- Handle product archival when disabled

### User Authentication
- Leverage Medusa's admin authentication system
- Use existing admin user sessions and permissions
- Integrate with Medusa's RBAC for fine-grained access control

### Event System Integration
- Emit Medusa events for product enablement changes
- Subscribe to Medusa product events for consistency
- Support custom event subscribers for extensibility