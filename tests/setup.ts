// Jest setup file for Medusa plugin testing
import 'jest';

// Global test configuration
global.console = {
  ...console,
  // Suppress console logs during tests unless LOG_LEVEL=debug
  log: process.env.LOG_LEVEL === 'debug' ? console.log : jest.fn(),
  debug: process.env.LOG_LEVEL === 'debug' ? console.debug : jest.fn(),
  info: process.env.LOG_LEVEL === 'debug' ? console.info : jest.fn(),
  warn: console.warn,
  error: console.error,
};

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PRINTIFY_API_KEY = 'test-api-key';
process.env.PRINTIFY_SHOP_ID = 'test-shop-id';
process.env.PRINTIFY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.PRINTIFY_SYNC_ENABLED = 'true';
process.env.PRINTIFY_SYNC_FREQUENCY_MINUTES = '60';
process.env.LOG_LEVEL = 'error';

// Increase test timeout for integration tests
jest.setTimeout(30000);