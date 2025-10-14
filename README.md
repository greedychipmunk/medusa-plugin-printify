# Medusa Printify Plugin

A comprehensive Medusa v2 plugin that integrates with Printify for print-on-demand product management and order fulfillment.

## Features

✅ **Product Management**
- Sync Printify products with your Medusa store
- Real-time inventory management
- Automatic price calculations with markup
- Bulk product operations

✅ **Order Processing & Fulfillment**
- Automatic order submission to Printify
- Real-time order status synchronization
- Tracking number management
- Order cancellation support

✅ **Shopping Cart Integration**
- Add Printify products to cart
- Real-time availability validation
- Custom product options and personalization
- Dynamic pricing updates

✅ **Admin Dashboard**
- Complete configuration management
- Order management interface
- Product synchronization tools
- Analytics and reporting

✅ **Advanced Features**
- Webhook support for real-time updates
- Comprehensive error handling with retry logic
- Detailed logging and monitoring
- TypeScript support with full type safety

## Installation

### 1. Install the Plugin

```bash
npm install medusa-plugin-printify
```

### 2. Add to Medusa Configuration

Add the plugin to your `medusa-config.js`:

```javascript
const plugins = [
  // ... other plugins
  {
    resolve: 'medusa-plugin-printify',
    options: {
      printify_api_key: process.env.PRINTIFY_API_KEY,
      printify_shop_id: process.env.PRINTIFY_SHOP_ID,
      webhook_secret: process.env.PRINTIFY_WEBHOOK_SECRET, // Optional
      sync_enabled: true, // Enable automatic product sync
      sync_frequency: 60, // Sync frequency in minutes
    },
  },
]

module.exports = {
  plugins,
  // ... rest of your config
}
```

### 3. Environment Variables

Create a `.env` file in your Medusa project root:

```bash
# Printify API Configuration
PRINTIFY_API_KEY=your_printify_api_key_here
PRINTIFY_SHOP_ID=your_printify_shop_id_here
PRINTIFY_WEBHOOK_SECRET=your_webhook_secret_here

# Optional: Plugin Configuration
PRINTIFY_SYNC_ENABLED=true
PRINTIFY_SYNC_FREQUENCY=60
PRINTIFY_AUTO_PUBLISH=false
PRINTIFY_DEFAULT_MARKUP=20
```

### 4. Database Migration

Run Medusa migrations to create the necessary database tables:

```bash
npx medusa migrations run
```

## Getting Started

### Step 1: Configure Printify API Access

1. **Get Your Printify API Key:**
   - Log in to your [Printify Dashboard](https://printify.com/)
   - Go to Settings → API
   - Generate a new API key
   - Copy the API key to your `.env` file

2. **Get Your Shop ID:**
   - In Printify Dashboard, go to My Shops
   - Note your shop ID from the URL or shop details
   - Add it to your `.env` file

3. **Test Your Configuration:**
   ```bash
   curl -H "Authorization: Bearer YOUR_API_KEY" \
        https://api.printify.com/v1/shops/YOUR_SHOP_ID/products.json
   ```

### Step 2: Configure the Plugin via Admin API

Use the admin endpoints to configure the plugin:

```bash
# Test the configuration
curl -X POST http://localhost:9000/admin/printify/config/test \
  -H "Content-Type: application/json" \
  -d '{
    "printify_api_key": "your_api_key",
    "printify_shop_id": "your_shop_id"
  }'

# Save the configuration
curl -X POST http://localhost:9000/admin/printify/config \
  -H "Content-Type: application/json" \
  -d '{
    "printify_api_key": "your_api_key",
    "printify_shop_id": "your_shop_id",
    "sync_enabled": true,
    "sync_frequency": 60
  }'
```

### Step 3: Sync Printify Products

#### Option A: Sync All Products
```bash
curl -X POST http://localhost:9000/admin/printify/products/sync/all
```

#### Option B: Sync Specific Products
```bash
curl -X POST http://localhost:9000/admin/printify/products/sync \
  -H "Content-Type: application/json" \
  -d '{
    "product_ids": ["printify_product_id_1", "printify_product_id_2"]
  }'
```

#### Option C: Manual Product Creation
```bash
curl -X POST http://localhost:9000/admin/printify/products \
  -H "Content-Type: application/json" \
  -d '{
    "printify_product_id": "your_printify_product_id",
    "title": "Custom T-Shirt",
    "description": "High-quality custom t-shirt",
    "enabled": true,
    "markup_percentage": 25
  }'
```

## Usage Guide

### Product Management

#### 1. List Printify Products
```bash
curl http://localhost:9000/admin/printify/products
```

#### 2. Get Product Details
```bash
curl http://localhost:9000/admin/printify/products/{product_id}
```

#### 3. Update Product Settings
```bash
curl -X PATCH http://localhost:9000/admin/printify/products/{product_id} \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "markup_percentage": 30,
    "auto_sync": true
  }'
```

#### 4. Bulk Operations
```bash
# Enable multiple products
curl -X POST http://localhost:9000/admin/printify/products/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "action": "enable",
    "product_ids": ["id1", "id2", "id3"]
  }'

# Update markup for multiple products
curl -X POST http://localhost:9000/admin/printify/products/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "action": "update_markup",
    "product_ids": ["id1", "id2"],
    "markup_percentage": 25
  }'
```

### Shopping Cart Integration

#### 1. Add Printify Product to Cart
```javascript
// Frontend JavaScript example
const cartService = medusa.cart;

await cartService.addItem('cart_id', {
  variant_id: 'printify_variant_id',
  quantity: 1,
  metadata: {
    printify_product_id: 'printify_product_id',
    customization: {
      design_id: 'custom_design_id',
      personalization: {
        name: 'John Doe',
        message: 'Custom message'
      }
    }
  }
});
```

#### 2. Validate Cart Items
```bash
curl -X POST http://localhost:9000/store/printify/cart/validate \
  -H "Content-Type: application/json" \
  -d '{
    "cart_id": "cart_12345"
  }'
```

#### 3. Get Cart with Printify Data
```bash
curl http://localhost:9000/store/carts/{cart_id}
```

### Order Management

#### 1. List Orders
```bash
curl "http://localhost:9000/admin/printify/orders?status=pending&limit=10"
```

#### 2. Create Order Manually
```bash
curl -X POST http://localhost:9000/admin/printify/orders \
  -H "Content-Type: application/json" \
  -d '{
    "medusa_order_id": "order_123",
    "customer_email": "customer@example.com",
    "cart_items": [
      {
        "id": "item_1",
        "product_id": "prod_123",
        "variant_id": "var_456",
        "printify_product_id": "printify_123",
        "printify_variant_id": "printify_var_456",
        "quantity": 2,
        "unit_price": 2500
      }
    ],
    "shipping_address": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "address1": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zip": "10001",
      "country": "US"
    }
  }'
```

#### 3. Submit Order to Printify
```bash
curl -X POST http://localhost:9000/admin/printify/orders/{order_id}/submit
```

#### 4. Sync Order Status
```bash
curl -X POST http://localhost:9000/admin/printify/orders/{order_id}/sync
```

#### 5. Cancel Order
```bash
curl -X POST http://localhost:9000/admin/printify/orders/{order_id}/cancel \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Customer requested cancellation"
  }'
```

#### 6. Get Order Statistics
```bash
curl "http://localhost:9000/admin/printify/orders/stats?date_from=2025-01-01&date_to=2025-12-31"
```

### Webhook Configuration

#### 1. Set Up Webhook Endpoint
```bash
curl -X POST http://localhost:9000/admin/printify/config \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_secret": "your_webhook_secret_here"
  }'
```

#### 2. Configure Webhook in Printify
- Go to Printify Dashboard → Settings → API
- Add webhook URL: `https://yourdomain.com/hooks/printify`
- Select events: Order updates, Product updates
- Set secret key (same as in your config)

## Frontend Integration

### React/Next.js Example

```typescript
// hooks/usePrintifyCart.ts
import { useState, useEffect } from 'react';
import { medusaClient } from '../lib/medusa';

export const usePrintifyCart = (cartId: string) => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(false);

  const addPrintifyItem = async (variantId: string, quantity: number, customization?: any) => {
    setLoading(true);
    try {
      const updatedCart = await medusaClient.carts.lineItems.create(cartId, {
        variant_id: variantId,
        quantity,
        metadata: {
          printify: true,
          customization
        }
      });
      setCart(updatedCart.cart);
    } catch (error) {
      console.error('Failed to add item:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateCart = async () => {
    try {
      const response = await fetch('/store/printify/cart/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart_id: cartId })
      });
      return response.json();
    } catch (error) {
      console.error('Cart validation failed:', error);
      return { valid: false };
    }
  };

  return { cart, addPrintifyItem, validateCart, loading };
};
```

```typescript
// components/PrintifyProductCard.tsx
import React from 'react';
import { usePrintifyCart } from '../hooks/usePrintifyCart';

interface PrintifyProductCardProps {
  product: any;
  cartId: string;
}

export const PrintifyProductCard: React.FC<PrintifyProductCardProps> = ({ 
  product, 
  cartId 
}) => {
  const { addPrintifyItem, loading } = usePrintifyCart(cartId);

  const handleAddToCart = async () => {
    await addPrintifyItem(product.variants[0].id, 1, {
      design_id: 'default',
      personalization: {}
    });
  };

  return (
    <div className="product-card">
      <h3>{product.title}</h3>
      <p>{product.description}</p>
      <span className="price">${product.variants[0].price / 100}</span>
      <button 
        onClick={handleAddToCart} 
        disabled={loading}
        className="add-to-cart-btn"
      >
        {loading ? 'Adding...' : 'Add to Cart'}
      </button>
    </div>
  );
};
```

## Configuration Options

### Plugin Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `printify_api_key` | string | required | Your Printify API key |
| `printify_shop_id` | string | required | Your Printify shop ID |
| `webhook_secret` | string | optional | Webhook verification secret |
| `sync_enabled` | boolean | true | Enable automatic product sync |
| `sync_frequency` | number | 60 | Sync frequency in minutes |
| `auto_publish` | boolean | false | Auto-publish synced products |
| `default_markup` | number | 20 | Default markup percentage |

### Environment Variables

```bash
# Required
PRINTIFY_API_KEY=your_api_key
PRINTIFY_SHOP_ID=your_shop_id

# Optional
PRINTIFY_WEBHOOK_SECRET=webhook_secret
PRINTIFY_SYNC_ENABLED=true
PRINTIFY_SYNC_FREQUENCY=60
PRINTIFY_AUTO_PUBLISH=false
PRINTIFY_DEFAULT_MARKUP=20
PRINTIFY_LOG_LEVEL=info
```

## API Reference

### Admin Endpoints

#### Configuration
- `GET /admin/printify/config` - Get current configuration
- `POST /admin/printify/config` - Create/update configuration
- `PATCH /admin/printify/config` - Update configuration
- `POST /admin/printify/config/test` - Test configuration
- `DELETE /admin/printify/config` - Delete configuration

#### Products
- `GET /admin/printify/products` - List products
- `POST /admin/printify/products` - Create product
- `GET /admin/printify/products/{id}` - Get product details
- `PATCH /admin/printify/products/{id}` - Update product
- `DELETE /admin/printify/products/{id}` - Delete product
- `POST /admin/printify/products/sync` - Sync specific products
- `POST /admin/printify/products/sync/all` - Sync all products
- `POST /admin/printify/products/bulk` - Bulk operations

#### Orders
- `GET /admin/printify/orders` - List orders
- `POST /admin/printify/orders` - Create order
- `GET /admin/printify/orders/{id}` - Get order details
- `PATCH /admin/printify/orders/{id}` - Update order
- `POST /admin/printify/orders/{id}/submit` - Submit to Printify
- `POST /admin/printify/orders/{id}/cancel` - Cancel order
- `POST /admin/printify/orders/{id}/sync` - Sync order status
- `GET /admin/printify/orders/stats` - Order statistics

### Store Endpoints

#### Cart
- `POST /store/printify/cart/validate` - Validate cart items
- `GET /store/printify/cart/{id}` - Get cart with Printify data

#### Products
- `GET /store/printify/products` - List available products
- `GET /store/printify/products/{id}` - Get product details

### Webhook Endpoints

- `POST /hooks/printify` - Printify webhook receiver

## Error Handling

The plugin includes comprehensive error handling with:

- **Automatic retry logic** with exponential backoff
- **User-friendly error messages**
- **Detailed logging** for debugging
- **Error classification** and recovery

### Common Error Types

| Error Type | Description | Retry | User Friendly |
|------------|-------------|-------|---------------|
| `validation_error` | Invalid input data | No | Yes |
| `inventory_error` | Stock availability issues | No | Yes |
| `payment_error` | Payment processing failed | No | Yes |
| `network_error` | Connection issues | Yes | Yes |
| `rate_limit_error` | API rate limit reached | Yes | Yes |
| `api_error` | General API errors | Yes | No |

## Troubleshooting

### Common Issues

#### 1. API Connection Failed
```bash
# Check API key and shop ID
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://api.printify.com/v1/shops/YOUR_SHOP_ID/products.json
```

#### 2. Products Not Syncing
- Check if `sync_enabled` is true in configuration
- Verify API credentials
- Check logs for sync errors
- Ensure products are published in Printify

#### 3. Orders Not Submitting
- Verify order contains only Printify products
- Check customer address format
- Ensure sufficient inventory
- Review order validation errors

#### 4. Webhook Not Working
- Verify webhook URL is accessible
- Check webhook secret configuration
- Review webhook logs in Printify dashboard
- Ensure HTTPS for production webhooks

### Debug Mode

Enable debug logging:

```bash
# Set log level to debug
PRINTIFY_LOG_LEVEL=debug
```

### Health Check

Monitor plugin health:

```bash
curl http://localhost:9000/admin/printify/health
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for your changes
4. Ensure all tests pass
5. Submit a pull request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/medusa-plugin-printify.git
cd medusa-plugin-printify

# Install dependencies
npm install

# Run tests
npm test

# Run linting
npm run lint

# Build the plugin
npm run build
```

## License

MIT License - see LICENSE file for details.

## Support

- 📖 [Documentation](https://github.com/your-org/medusa-plugin-printify/wiki)
- 🐛 [Issues](https://github.com/your-org/medusa-plugin-printify/issues)
- 💬 [Discussions](https://github.com/your-org/medusa-plugin-printify/discussions)
- 📧 [Email Support](mailto:support@your-org.com)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.
