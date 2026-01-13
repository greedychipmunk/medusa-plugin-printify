import { defineConfig, loadEnv } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
      storeCors: process.env.STORE_CORS || "http://localhost:8000",
      adminCors: process.env.ADMIN_CORS || "http://localhost:7001,http://localhost:7000",
      authCors: process.env.AUTH_CORS || "http://localhost:7001,http://localhost:7000,http://localhost:8000",
    },
    redisUrl: process.env.REDIS_URL,
  },
  admin: {
    backendUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
  },
  modules: [
    {
      resolve: "./src/modules/printify",
      options: {
        // Printify module configuration
        apiKey: process.env.PRINTIFY_API_KEY,
        shopId: process.env.PRINTIFY_SHOP_ID,
        developmentMode: process.env.NODE_ENV === "development",
        webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
        sync: {
          enabled: process.env.PRINTIFY_SYNC_ENABLED === "true",
          frequency: parseInt(process.env.PRINTIFY_SYNC_FREQUENCY || "60"),
          batchSize: parseInt(process.env.PRINTIFY_SYNC_BATCH_SIZE || "100"),
        },
        logging: {
          level: process.env.PRINTIFY_LOG_LEVEL || (process.env.NODE_ENV === "development" ? "debug" : "info"),
          structured: process.env.PRINTIFY_STRUCTURED_LOGGING === "true",
        },
      },
    },
  ],
  plugins: [
    {
      resolve: "./src",
      options: {
        printify: {
          apiKey: process.env.PRINTIFY_API_KEY,
          shopId: process.env.PRINTIFY_SHOP_ID,
          developmentMode: process.env.NODE_ENV === "development",
          webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
        },
        sync: {
          enabled: process.env.PRINTIFY_SYNC_ENABLED !== "false",
          frequency: parseInt(process.env.PRINTIFY_SYNC_FREQUENCY || "60"),
          batchSize: parseInt(process.env.PRINTIFY_SYNC_BATCH_SIZE || "100"),
        },
        logging: {
          level: process.env.PRINTIFY_LOG_LEVEL || (process.env.NODE_ENV === "development" ? "debug" : "info"),
          structured: process.env.PRINTIFY_STRUCTURED_LOGGING !== "false",
        },
      },
    },
  ],
})