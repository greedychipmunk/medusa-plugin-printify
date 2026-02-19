/**
 * Generate MikroORM migrations from DML models.
 *
 * Usage: node scripts/generate-migrations.js
 *
 * Requires a running Postgres instance.  Connection is read from
 * DATABASE_URL (from .env or environment) falling back to the
 * individual DB_* variables used by the Medusa CLI.
 *
 * This script replaces `npx medusa plugin:db:generate` which
 * currently fails when the models/ directory contains non-DML
 * TypeScript files (plain classes / interfaces).
 */

const path = require("path")
const { DmlEntity, defineMikroOrmCliConfig } = require("@medusajs/framework/utils")
const { MikroORM } = require("@medusajs/framework/mikro-orm/postgresql")

// Load .env so DATABASE_URL is available
try { require("dotenv").config() } catch { /* dotenv optional */ }

// Register ts-node so we can require .ts model files directly
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: { module: "Node16", moduleResolution: "Node16" },
})

const MODEL_DIR = path.resolve(__dirname, "../src/modules/printify/models")
const MIGRATION_DIR = path.resolve(__dirname, "../src/modules/printify/migrations")

// Only list the DML model files (not plain-class helpers like cart-item, variant, etc.)
const DML_MODEL_FILES = [
  "printify-configuration",
  "printify-product",
  "printify-order",
  "printify-webhook-event",
]

async function main() {
  const entities = []
  for (const name of DML_MODEL_FILES) {
    const mod = require(path.join(MODEL_DIR, name))
    const entity = mod.default || mod
    if (!DmlEntity.isDmlEntity(entity)) {
      console.error(`WARNING: ${name} is not a DML entity — skipping`)
      continue
    }
    entities.push(entity)
  }

  if (entities.length === 0) {
    console.error("No DML entities found")
    process.exit(1)
  }

  const connectionUrl =
    process.env.DATABASE_URL ||
    `postgres://${process.env.DB_USERNAME || "postgres"}:${process.env.DB_PASSWORD || ""}@${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "medusa_printify_dev"}`

  const config = defineMikroOrmCliConfig("printify", {
    entities,
    clientUrl: connectionUrl,
    migrations: { path: MIGRATION_DIR },
  })

  const orm = await MikroORM.init(config)
  const migrator = orm.getMigrator()
  const result = await migrator.createMigration()

  if (result.fileName) {
    console.log(`Migration created: ${result.fileName}`)
  } else {
    console.log("No migration needed (schema is up to date)")
  }

  await orm.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
