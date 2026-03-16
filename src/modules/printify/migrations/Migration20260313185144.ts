import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260313185144 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "printify_product" add column if not exists "visibility_override" boolean null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "printify_product" drop column if exists "visibility_override";`);
  }

}
