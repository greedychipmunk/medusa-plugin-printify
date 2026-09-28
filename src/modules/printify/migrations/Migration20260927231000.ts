import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260927231000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "printify_product" add column if not exists "is_locked" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "printify_product" drop column if exists "is_locked";`);
  }

}
