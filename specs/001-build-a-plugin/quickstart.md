# Quickstart: Medusa Printify Integration Plugin

This guide helps you quickly set up and test the Medusa Printify integration plugin in your development environment.

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database running
- Medusa v2 application set up
- Printify account with API access
- Git for version control

## Installation

### 1. Install the Plugin

```bash
npm install medusa-plugin-printify
```

### 2. Configure the Plugin

Add the plugin to your `medusa-config.js`:

```javascript
module.exports = defineConfig({
  plugins: [
    {
      resolve: "medusa-plugin-printify",
      options: {
        // Optional: Override default configuration
      }
    }
    // ... other plugins
  ]
})
```

### 3. Run Database Migrations

```bash
npx medusa db:migrate
```

## Quick Setup

### 1. Start Your Medusa Server

```bash
npm run dev
```

### 2. Access Medusa Admin

Open your browser and navigate to:
```
http://localhost:9000/app
```

### 3. Configure Printify Integration

1. Log in to Medusa Admin
2. Navigate to **Settings** → **Printify Integration**
3. Enter your Printify credentials:
   - **API Key**: Your Printify API token
   - **Shop ID**: Your Printify shop identifier
4. Enable automatic synchronization (optional)
5. Click **Save Configuration**

### 4. Import and Enable Products

1. Click **Sync Products** to fetch products from Printify
2. Review the imported products list
3. Enable products you want to display on storefront:
   - Toggle individual products ON/OFF
   - Use **Select All** for bulk operations
4. Click **Save Changes**

## Testing the Integration

### Test Admin Functionality

1. **Configuration Test**:
   - Try invalid API credentials (should show error)
   - Save valid credentials (should show success)

2. **Product Management Test**:
   - Enable a product → Check it appears in product list
   - Disable a product → Verify it's hidden from storefront

3. **Bulk Operations Test**:
   - Select multiple products
   - Use bulk enable/disable functionality

### Test Storefront Display

1. **View Enabled Products**:
   ```bash
   curl http://localhost:9000/store/products
   ```
   
2. **Verify Product Filtering**:
   - Enabled Printify products should appear
   - Disabled products should not appear

3. **Test Product Details**:
   - Click on an enabled product
   - Verify all product information displays correctly

### Test Synchronization

1. **Manual Sync**:
   - Go to **Printify** → **Sync Logs**
   - Click **Manual Sync**
   - Check sync status and any errors

2. **Webhook Testing** (Advanced):
   ```bash
   # Use ngrok for local webhook testing
   ngrok http 9000
   
   # Configure webhook URL in Printify dashboard:
   # https://your-ngrok-url.ngrok.io/webhooks/printify
   ```

## Common Issues & Solutions

### Plugin Not Loading
- Verify plugin is listed in `medusa-config.js`
- Check console for error messages
- Ensure database migrations completed successfully

### API Connection Failed
- Verify Printify API key is correct
- Check network connectivity
- Review API rate limits

### Products Not Syncing
- Check sync logs for error messages
- Verify webhook URL is accessible
- Ensure Printify account has products

### Admin UI Not Appearing
- Clear browser cache
- Check admin user permissions
- Verify plugin registration in config

## Environment Variables

Create a `.env` file with:

```bash
# Required for production
DATABASE_URL=postgres://username:password@localhost:5432/medusa-store
REDIS_URL=redis://localhost:6379

# Optional: Override plugin settings
PRINTIFY_WEBHOOK_SECRET=your_webhook_secret
PRINTIFY_SYNC_FREQUENCY=60
```

## Development Commands

```bash
# Start development server
npm run dev

# Run tests
npm run test

# Build for production
npm run build

# Database operations
npx medusa db:migrate
npx medusa db:seed

# Plugin-specific commands
npx medusa printify:sync
npx medusa printify:status
```

## API Testing

Use these curl commands to test the API endpoints:

```bash
# Get plugin configuration
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:9000/admin/printify/config

# List products
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:9000/admin/printify/products

# Enable a product
curl -X POST -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:9000/admin/printify/products/PRODUCT_ID/enable

# Trigger manual sync
curl -X POST -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:9000/admin/printify/sync
```

## Next Steps

- Review the [full documentation](./README.md)
- Check out [API contracts](./contracts/api.yaml)
- Explore [data model](./data-model.md) for customization
- Set up production deployment following [deployment guide](./deployment.md)

## Getting Help

- Check [troubleshooting guide](./troubleshooting.md)
- Review [sync logs](http://localhost:9000/app/printify/logs) in admin
- Join the [Medusa Discord](https://discord.gg/medusajs) for community support
- Report issues on [GitHub](https://github.com/your-org/medusa-plugin-printify/issues)
