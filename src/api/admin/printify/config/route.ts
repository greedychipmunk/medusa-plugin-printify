/**
 * Admin Configuration API Routes
 * 
 * Handles configuration management for the Printify plugin including
 * creating, updating, and testing Printify API connections.
 */

import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from 'zod';
import { PrintifyConfigurationService } from '../../../../modules/printify/services/printify-configuration-service';
import { logger } from '../../../../modules/printify/utils/logger';
import { ErrorFactory, PrintifyPluginError } from '../../../../modules/printify/utils/error-handling';

// Request validation schemas
const createConfigSchema = z.object({
  printify_api_key: z.string().min(1, 'API key is required'),
  printify_shop_id: z.string().min(1, 'Shop ID is required'),
  webhook_secret: z.string().optional(),
  sync_enabled: z.boolean().default(true),
  sync_frequency: z.number().min(5).max(1440).default(60),
});

const updateConfigSchema = z.object({
  printify_api_key: z.string().min(1).optional(),
  printify_shop_id: z.string().min(1).optional(),
  webhook_secret: z.string().optional(),
  sync_enabled: z.boolean().optional(),
  sync_frequency: z.number().min(5).max(1440).optional(),
});

const configService = new PrintifyConfigurationService();
const apiLogger = logger.child('AdminConfigAPI');

/**
 * GET /admin/printify/config
 * Get current configuration for the store
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    // Extract store ID from request (in real Medusa, this would come from auth context)
    const storeId = req.auth_context?.actor_id || 'default-store';
    
    apiLogger.info('Getting configuration', { storeId });

    const configuration = await configService.getConfiguration(storeId);

    if (!configuration) {
      res.status(404).json({
        success: false,
        error: 'Configuration not found',
        message: 'No Printify configuration exists for this store',
      });
      return;
    }

    // Return configuration without sensitive data
    res.status(200).json({
      success: true,
      data: {
        id: configuration.id,
        store_id: configuration.store_id,
        printify_shop_id: configuration.printify_shop_id,
        sync_enabled: configuration.sync_enabled,
        sync_frequency: configuration.sync_frequency,
        has_api_key: !!configuration.printify_api_key,
        has_webhook_secret: !!configuration.webhook_secret,
        created_at: configuration.created_at,
        updated_at: configuration.updated_at,
      },
    });
  } catch (error) {
    apiLogger.error('Failed to get configuration', error as Error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to retrieve configuration',
    });
  }
}

/**
 * POST /admin/printify/config
 * Create or update configuration for the store
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || 'default-store';
    
    apiLogger.info('Creating/updating configuration', { storeId });

    // Validate request body
    const validationResult = createConfigSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Invalid request data',
        details: validationResult.error.issues,
      });
      return;
    }

    const configData = validationResult.data;

    // Check if configuration already exists
    const existingConfig = await configService.getConfiguration(storeId);
    let configuration;

    if (existingConfig) {
      // Update existing configuration
      configuration = await configService.updateConfiguration(storeId, configData);
      apiLogger.info('Configuration updated', { storeId, configId: configuration.id });
    } else {
      // Create new configuration
      configuration = await configService.createConfiguration({
        store_id: storeId,
        ...configData,
      });
      apiLogger.info('Configuration created', { storeId, configId: configuration.id });
    }

    res.status(existingConfig ? 200 : 201).json({
      success: true,
      message: existingConfig ? 'Configuration updated successfully' : 'Configuration created successfully',
      data: {
        id: configuration.id,
        store_id: configuration.store_id,
        printify_shop_id: configuration.printify_shop_id,
        sync_enabled: configuration.sync_enabled,
        sync_frequency: configuration.sync_frequency,
        created_at: configuration.created_at,
        updated_at: configuration.updated_at,
      },
    });
  } catch (error) {
    apiLogger.error('Failed to create/update configuration', error as Error);

    if (error instanceof PrintifyPluginError) {
      res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to save configuration',
    });
  }
}

/**
 * PUT /admin/printify/config
 * Update existing configuration
 */
export async function PUT(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const storeId = req.auth_context?.actor_id || 'default-store';
    
    apiLogger.info('Updating configuration', { storeId });

    // Validate request body
    const validationResult = updateConfigSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Invalid request data',
        details: validationResult.error.issues,
      });
      return;
    }

    const configData = validationResult.data;

    // Update configuration
    const configuration = await configService.updateConfiguration(storeId, configData);

    apiLogger.info('Configuration updated successfully', { 
      storeId, 
      configId: configuration.id 
    });

    res.status(200).json({
      success: true,
      message: 'Configuration updated successfully',
      data: {
        id: configuration.id,
        store_id: configuration.store_id,
        printify_shop_id: configuration.printify_shop_id,
        sync_enabled: configuration.sync_enabled,
        sync_frequency: configuration.sync_frequency,
        updated_at: configuration.updated_at,
      },
    });
  } catch (error) {
    apiLogger.error('Failed to update configuration', error as Error);

    if (error instanceof PrintifyPluginError) {
      res.status(error.code === 'INVALID_CONFIG' ? 404 : 400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to update configuration',
    });
  }
}