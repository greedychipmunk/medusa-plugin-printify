export { default as PrintifyConfigurationWidget } from './printify-configuration-widget';
export { default as PrintifyProductManagementWidget } from './printify-product-management-widget';

// Widget definitions for Medusa admin
export const printifyWidgets = [
  {
    id: 'printify-configuration',
    name: 'Printify Configuration',
    description: 'Configure Printify API settings and sync preferences',
    component: 'PrintifyConfigurationWidget',
    zone: 'settings',
    category: 'integrations',
  },
  {
    id: 'printify-product-management',
    name: 'Printify Products',
    description: 'Manage Printify products and storefront visibility',
    component: 'PrintifyProductManagementWidget',
    zone: 'products',
    category: 'management',
  },
];