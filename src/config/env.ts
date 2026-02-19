import { z } from 'zod';
import { createLogger } from '../modules/printify/utils/logger';

// Environment variable schema for validation
export const envSchema = z.object({
  PRINTIFY_API_KEY: z.string().min(1, 'Printify API key is required'),
  PRINTIFY_SHOP_ID: z.string().min(1, 'Printify shop ID is required'),
  PRINTIFY_WEBHOOK_SECRET: z.string().optional(),
  PRINTIFY_WEBHOOK_URL: z.string().url().optional(),
  PRINTIFY_SYNC_ENABLED: z
    .string()
    .transform((val: string) => val === 'true')
    .default('true'),
  PRINTIFY_SYNC_FREQUENCY_MINUTES: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .refine((val: number) => val >= 5 && val <= 1440, {
      message: 'Sync frequency must be between 5 and 1440 minutes',
    })
    .default('60'),
  PRINTIFY_API_TIMEOUT_MS: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default('10000'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug'])
    .default('info'),
});

export type PluginConfig = z.infer<typeof envSchema>;

const envLogger = createLogger('Printify:Config');

// Parse and validate environment variables
export function validateConfig(): PluginConfig {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    envLogger.error('Invalid plugin configuration', error as Error);
    throw new Error('Plugin configuration validation failed');
  }
}

// Default configuration for development
export const defaultConfig: Partial<PluginConfig> = {
  PRINTIFY_SYNC_ENABLED: true,
  PRINTIFY_SYNC_FREQUENCY_MINUTES: 60,
  PRINTIFY_API_TIMEOUT_MS: 10000,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
};