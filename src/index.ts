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
 * Medusa Printify Plugin
 * 
 * Main plugin entry point that registers the Printify integration
 * with Medusa, including modules, services, API routes, and admin widgets.
 */
export default function printifyPlugin(
  container: any,
  options: PrintifyPluginOptions = {}
) {
  const config = { ...defaultConfig, ...options };
  
  // Register plugin configuration in container
  container.register('printifyPluginConfig', {
    resolve: () => config,
  });

  // Register modules
  container.registerModule('printify', './modules/printify');

  return {
    name: 'medusa-plugin-printify',
    version: '1.0.0',
    config,
  };
}