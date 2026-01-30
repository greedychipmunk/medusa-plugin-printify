/**
 * Admin widgets exports for MedusaJS v2.12+
 *
 * Each widget file exports:
 * - default: The widget React component
 * - config: The widget configuration from defineWidgetConfig
 *
 * The Medusa admin bundler discovers widgets by scanning the widgets directory.
 * These re-exports provide named access to widget components and their configs.
 */

// Widget components
export { default as PrintifyConfigurationWidget } from './printify-configuration-widget'
export { default as PrintifyProductManagementWidget } from './printify-product-management-widget'

// Widget configs (renamed to avoid conflicts)
export { config as printifyConfigurationConfig } from './printify-configuration-widget'
export { config as printifyProductManagementConfig } from './printify-product-management-widget'