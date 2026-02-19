/**
 * Admin Configuration API Routes
 *
 * Handles configuration management for the Printify plugin including
 * creating, updating, and testing Printify API connections.
 */

import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import type PrintifyModuleService from "../../../../modules/printify/service"
import { PRINTIFY_MODULE } from "../../../../modules/printify"
import { logger } from "../../../../modules/printify/utils/logger"
import { PrintifyPluginError } from "../../../../modules/printify/utils/error-handling"

// Request validation schemas
const createConfigSchema = z.object({
  printify_api_key: z.string().min(1, "API key is required"),
  printify_shop_id: z.string().min(1, "Shop ID is required"),
  webhook_secret: z.string().optional(),
  sync_enabled: z.boolean().default(true),
  sync_frequency: z.number().min(5).max(1440).default(60),
  auto_submit_orders: z.boolean().default(false),
  notification_emails: z.string().optional(),
  notify_dead_lettered_orders: z.boolean().default(true),
  notify_failed_syncs: z.boolean().default(true),
  notify_webhook_errors: z.boolean().default(true),
})

const updateConfigSchema = z.object({
  printify_api_key: z.string().min(1).optional(),
  printify_shop_id: z.string().min(1).optional(),
  webhook_secret: z.string().optional(),
  sync_enabled: z.boolean().optional(),
  sync_frequency: z.number().min(5).max(1440).optional(),
  auto_submit_orders: z.boolean().optional(),
  notification_emails: z.string().optional(),
  notify_dead_lettered_orders: z.boolean().optional(),
  notify_failed_syncs: z.boolean().optional(),
  notify_webhook_errors: z.boolean().optional(),
})

const apiLogger = logger.child("AdminConfigAPI")

/**
 * GET /admin/printify/config
 * Get current configuration for the store
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || "default-store"
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    apiLogger.info("Getting configuration", { storeId })

    const configuration = await printifyService.getConfigurationByStoreId(storeId)

    if (!configuration) {
      res.status(404).json({
        success: false,
        error: "Configuration not found",
        message: "No Printify configuration exists for this store",
      })
      return
    }

    res.status(200).json({
      success: true,
      data: {
        id: configuration.id,
        store_id: configuration.store_id,
        printify_shop_id: configuration.printify_shop_id,
        sync_enabled: configuration.sync_enabled,
        sync_frequency: configuration.sync_frequency,
        auto_submit_orders: configuration.auto_submit_orders,
        has_api_key: !!configuration.printify_api_key,
        has_webhook_secret: !!configuration.webhook_secret,
        notification_emails: (configuration as any).notification_emails ?? null,
        notify_dead_lettered_orders: (configuration as any).notify_dead_lettered_orders ?? true,
        notify_failed_syncs: (configuration as any).notify_failed_syncs ?? true,
        notify_webhook_errors: (configuration as any).notify_webhook_errors ?? true,
        created_at: configuration.created_at,
        updated_at: configuration.updated_at,
      },
    })
  } catch (error) {
    apiLogger.error("Failed to get configuration", error as Error)

    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to retrieve configuration",
    })
  }
}

/**
 * POST /admin/printify/config
 * Create or update configuration for the store
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || "default-store"
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    apiLogger.info("Creating/updating configuration", { storeId })

    const validationResult = createConfigSchema.safeParse(req.body)
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Validation error",
        message: "Invalid request data",
        details: validationResult.error.issues,
      })
      return
    }

    const configData = validationResult.data
    const existing = await printifyService.getConfigurationByStoreId(storeId)

    const configuration = await printifyService.createOrUpdateConfiguration(storeId, {
      store_id: storeId,
      ...configData,
    })

    res.status(existing ? 200 : 201).json({
      success: true,
      message: existing
        ? "Configuration updated successfully"
        : "Configuration created successfully",
      data: {
        id: configuration?.id,
        store_id: configuration?.store_id,
        printify_shop_id: configuration?.printify_shop_id,
        sync_enabled: configuration?.sync_enabled,
        sync_frequency: configuration?.sync_frequency,
        auto_submit_orders: configuration?.auto_submit_orders,
        notification_emails: (configuration as any)?.notification_emails ?? null,
        notify_dead_lettered_orders: (configuration as any)?.notify_dead_lettered_orders ?? true,
        notify_failed_syncs: (configuration as any)?.notify_failed_syncs ?? true,
        notify_webhook_errors: (configuration as any)?.notify_webhook_errors ?? true,
        created_at: configuration?.created_at,
        updated_at: configuration?.updated_at,
      },
    })
  } catch (error) {
    apiLogger.error("Failed to create/update configuration", error as Error)

    if (error instanceof PrintifyPluginError) {
      res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      })
      return
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to save configuration",
    })
  }
}

/**
 * PUT /admin/printify/config
 * Update existing configuration
 */
export async function PUT(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || "default-store"
    const printifyService: PrintifyModuleService = req.scope.resolve(PRINTIFY_MODULE)

    apiLogger.info("Updating configuration", { storeId })

    const validationResult = updateConfigSchema.safeParse(req.body)
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Validation error",
        message: "Invalid request data",
        details: validationResult.error.issues,
      })
      return
    }

    const configData = validationResult.data
    const existing = await printifyService.getConfigurationByStoreId(storeId)

    if (!existing) {
      res.status(404).json({
        success: false,
        error: "INVALID_CONFIG",
        message: "Configuration not found",
      })
      return
    }

    const configuration = await printifyService.createOrUpdateConfiguration(storeId, {
      store_id: storeId,
      printify_api_key: configData.printify_api_key || existing.printify_api_key,
      printify_shop_id: configData.printify_shop_id || existing.printify_shop_id,
      webhook_secret: configData.webhook_secret ?? existing.webhook_secret ?? undefined,
      sync_enabled: configData.sync_enabled ?? existing.sync_enabled,
      sync_frequency: configData.sync_frequency ?? existing.sync_frequency,
      auto_submit_orders: configData.auto_submit_orders ?? existing.auto_submit_orders,
      notification_emails: configData.notification_emails ?? (existing as any).notification_emails ?? undefined,
      notify_dead_lettered_orders: configData.notify_dead_lettered_orders ?? (existing as any).notify_dead_lettered_orders,
      notify_failed_syncs: configData.notify_failed_syncs ?? (existing as any).notify_failed_syncs,
      notify_webhook_errors: configData.notify_webhook_errors ?? (existing as any).notify_webhook_errors,
    })

    res.status(200).json({
      success: true,
      message: "Configuration updated successfully",
      data: {
        id: configuration?.id,
        store_id: configuration?.store_id,
        printify_shop_id: configuration?.printify_shop_id,
        sync_enabled: configuration?.sync_enabled,
        sync_frequency: configuration?.sync_frequency,
        auto_submit_orders: configuration?.auto_submit_orders,
        notification_emails: (configuration as any)?.notification_emails ?? null,
        notify_dead_lettered_orders: (configuration as any)?.notify_dead_lettered_orders ?? true,
        notify_failed_syncs: (configuration as any)?.notify_failed_syncs ?? true,
        notify_webhook_errors: (configuration as any)?.notify_webhook_errors ?? true,
        updated_at: configuration?.updated_at,
      },
    })
  } catch (error) {
    apiLogger.error("Failed to update configuration", error as Error)

    if (error instanceof PrintifyPluginError) {
      res.status(error.code === "INVALID_CONFIG" ? 404 : 400).json({
        success: false,
        error: error.code,
        message: error.message,
      })
      return
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to update configuration",
    })
  }
}
