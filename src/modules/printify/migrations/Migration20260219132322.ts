import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260219132322 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "printify_configuration" ("id" text not null, "store_id" text not null, "printify_api_key" text not null, "printify_shop_id" text not null, "webhook_secret" text null, "sync_enabled" boolean not null default false, "sync_frequency" integer not null default 60, "auto_submit_orders" boolean not null default false, "max_order_retries" integer not null default 3, "retry_backoff_minutes" integer not null default 5, "webhook_retention_days" integer not null default 30, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "printify_configuration_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_printify_configuration_deleted_at" ON "printify_configuration" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "printify_order" ("id" text not null, "medusa_order_id" text not null, "printify_order_id" text null, "configuration_id" text not null, "status" text not null default 'pending', "line_items" jsonb not null, "shipping_address" jsonb not null, "total_price" integer not null, "shipping_method" integer not null default 1, "tracking" jsonb null, "printify_data" jsonb null, "submitted_at" timestamptz null, "error_details" text null, "retry_count" integer not null default 0, "last_error_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "printify_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_printify_order_deleted_at" ON "printify_order" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "printify_product" ("id" text not null, "printify_product_id" text not null, "medusa_product_id" text null, "configuration_id" text not null, "title" text not null, "description" text null, "enabled" boolean not null default false, "blueprint_id" text not null, "print_provider_id" text not null, "tags" jsonb null, "images" jsonb null, "printify_data" jsonb null, "last_sync_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "printify_product_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_printify_product_deleted_at" ON "printify_product" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "printify_webhook_event" ("id" text not null, "configuration_id" text not null, "event_type" text not null, "payload" jsonb not null, "signature" text null, "processing_status" text not null default 'success', "processing_error" text null, "received_at" timestamptz not null, "processed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "printify_webhook_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_printify_webhook_event_deleted_at" ON "printify_webhook_event" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "printify_configuration" cascade;`);

    this.addSql(`drop table if exists "printify_order" cascade;`);

    this.addSql(`drop table if exists "printify_product" cascade;`);

    this.addSql(`drop table if exists "printify_webhook_event" cascade;`);
  }

}
