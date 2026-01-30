/**
 * Admin extensions export for MedusaJS v2.12+
 *
 * This file exports all admin widgets and customizations.
 * The Medusa admin bundler uses this entry point to discover plugin widgets.
 */

// Re-export all widgets and their configs
export * from './widgets'

// Re-export individual widget modules for direct imports
export { default as PrintifyConfigurationWidget, config as PrintifyConfigurationWidgetConfig } from './widgets/printify-configuration-widget'
export { default as PrintifyProductManagementWidget, config as PrintifyProductManagementWidgetConfig } from './widgets/printify-product-management-widget'
