// No specific imports needed for plugin options - using plain TypeScript interface

/**
 * Medusa Printify Plugin
 * 
 * Main plugin entry point that registers the Printify integration
 * with Medusa, including models, services, API routes, and admin widgets.
 */

// Export plugin models
export { PrintifyConfiguration } from './modules/printify/models/printify-configuration';
export { PrintifyProduct } from './modules/printify/models/printify-product';
export { PrintifyProductVariant } from './modules/printify/models/printify-product-variant';
export { SyncLog } from './modules/printify/models/sync-log';
export { ProductEnablementHistory } from './modules/printify/models/product-enablement-history';

// Export plugin services
export { PrintifyConfigurationService } from './modules/printify/services/printify-configuration-service';
export { PrintifyProductService } from './modules/printify/services/printify-product-service';
export { StorefrontProductService } from './modules/printify/services/storefront-product-service';
export { PrintifyApiClient } from './modules/printify/services/printify-api-client';

// Export utilities
export { logger } from './modules/printify/utils/logger';
export { 
  PrintifyPluginError, 
  ErrorCode, 
  ErrorSeverity, 
  ErrorFactory 
} from './modules/printify/utils/error-handling';

// Export admin widgets
export { 
  PrintifyConfigurationWidget, 
  PrintifyProductManagementWidget,
  printifyWidgets 
} from './admin/widgets';

// Export API routes
export { createStorefrontProductRoutes } from './modules/printify/api/storefront/products';

// Export middleware
export { 
  authenticateAdmin, 
  validateRequest, 
  auditLogger, 
  errorHandler 
} from './middleware';

/**
 * Plugin configuration interface
 */
export interface PrintifyPluginOptions {
  /** Printify API configuration */
  printify?: {
    /** Default API key (optional, can be configured via admin) */
    apiKey?: string;
    /** Default shop ID (optional, can be configured via admin) */
    shopId?: string;
    /** Enable development mode with additional logging */
    developmentMode?: boolean;
    /** Webhook endpoint base URL */
    webhookBaseUrl?: string;
  };
  
  /** Sync configuration */
  sync?: {
    /** Enable automatic synchronization */
    enabled?: boolean;
    /** Default sync frequency in minutes */
    frequency?: number;
    /** Maximum products to sync per batch */
    batchSize?: number;
  };
  
  /** Logging configuration */
  logging?: {
    /** Log level (error, warn, info, debug) */
    level?: 'error' | 'warn' | 'info' | 'debug';
    /** Enable structured logging */
    structured?: boolean;
  };
}

/**
 * Default plugin configuration
 */
export const defaultConfig: PrintifyPluginOptions = {
  printify: {
    developmentMode: process.env.NODE_ENV === 'development',
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL || '',
  },
  sync: {
    enabled: true,
    frequency: 60, // 1 hour
    batchSize: 100,
  },
  logging: {
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    structured: true,
  },
};

/**
 * Plugin definition
 */
export default async function printifyPlugin(
  container: any,
  options: PrintifyPluginOptions = {}
): Promise<void> {
  const config = { ...defaultConfig, ...options };
  
  // Register plugin configuration in container
  container.register('printifyPluginConfig', {
    resolve: () => config,
  });

  // Log plugin initialization
  const { logger } = await import('./modules/printify/utils/logger');
  logger.info('Printify plugin initialized', {
    version: '1.0.0',
    config: {
      syncEnabled: config.sync?.enabled,
      syncFrequency: config.sync?.frequency,
      developmentMode: config.printify?.developmentMode,
      logLevel: config.logging?.level,
    },
  });

  // In a real Medusa v2 plugin, additional setup would be done here:
  // - Register database models
  // - Set up event handlers
  // - Initialize background jobs
  // - Configure webhook endpoints
}