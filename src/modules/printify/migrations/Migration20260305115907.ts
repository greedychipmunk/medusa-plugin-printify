import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260305115907 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "printify_order" ("id" text not null, "printify_id" text null, "shop_id" text not null, "medusa_order_id" text null, "status" text not null default 'pending', "shipping_method" text null, "line_items" jsonb not null, "address_to" jsonb not null, "total_cost" integer null, "cost_per_item" jsonb null, "submitted_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "printify_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_printify_order_deleted_at" ON "printify_order" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "printify_product" ("id" text not null, "printify_id" text not null, "shop_id" text not null, "title" text not null, "description" text not null, "variants" jsonb not null, "images" jsonb not null, "print_areas" jsonb not null, "is_published" boolean not null default false, "printify_data" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "printify_product_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_printify_product_deleted_at" ON "printify_product" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "printify_shop" ("id" text not null, "printify_id" text not null, "title" text not null, "sales_channel_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "printify_shop_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_printify_shop_deleted_at" ON "printify_shop" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "printify_order" cascade;`);

    this.addSql(`drop table if exists "printify_product" cascade;`);

    this.addSql(`drop table if exists "printify_shop" cascade;`);
  }

}
