import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260320120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "printify_product" add column if not exists "image_urls" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "printify_product" drop column if exists "image_urls";`);
  }

}
