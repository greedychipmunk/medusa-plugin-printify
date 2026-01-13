# Printify Plugin - Publishing Guide

## Issue Fixed

**Error**: `TypeError: cmd is not a function` when running `npx medusa plugin:publish`

**Root Cause**: The MedusaJS CLI `plugin:publish` command expects plugins created with the official plugin template (`npx create-medusa-app my-plugin --plugin`). Since this plugin was created manually, it lacks the required `.medusa` directory structure and command modules.

**Solution**: Use `yalc` directly for local development/testing, or standard `npm publish` for public publishing.

---

## Publishing Options

### Option 1: Local Development with Yalc (Recommended for Testing)

Yalc creates a local package registry for testing plugins before publishing to NPM.

#### Step 1: Install Yalc Globally

```bash
npm install -g yalc
```

#### Step 2: Publish Plugin Locally

From the plugin directory:

```bash
yalc publish
```

This will:
- Run `npm run build` (via prepublishOnly)
- Publish to local yalc registry
- Make the plugin available for local installation

#### Step 3: Install in Medusa Application

Navigate to your Medusa application and run:

```bash
cd /path/to/your-medusa-app
yalc add @trendtri/medusa-plugin-printify
```

#### Step 4: Register Plugin

Add to your `medusa-config.ts`:

```typescript
import { defineConfig } from "@medusajs/framework/utils"

export default defineConfig({
  plugins: [
    {
      resolve: "@trendtri/medusa-plugin-printify",
      options: {
        printify: {
          apiKey: process.env.PRINTIFY_API_KEY,
          shopId: process.env.PRINTIFY_SHOP_ID,
        },
        sync: {
          enabled: true,
          frequency: 60,
          batchSize: 100,
        },
      },
    },
  ],
})
```

#### Step 5: Watch for Changes During Development

In the **plugin directory**, run:

```bash
yalc push --watch
```

This watches for file changes and automatically updates the plugin in all linked Medusa applications.

#### Uninstall from Local Registry

When done testing:

```bash
cd /path/to/your-medusa-app
yalc remove @trendtri/medusa-plugin-printify
npm install
```

---

### Option 2: Publish to NPM (For Public Distribution)

#### Prerequisites

1. NPM account with appropriate permissions
2. Plugin tested locally
3. All tests passing
4. Documentation complete

#### Publishing Steps

1. **Build the Plugin**

```bash
npm run build
```

2. **Run Tests**

```bash
npm test
```

3. **Update Version** (following semver)

```bash
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0
```

4. **Login to NPM** (if not already)

```bash
npm login
```

5. **Publish to NPM**

```bash
npm publish --access public
```

For scoped packages (@trendtri), you need `--access public` unless you have a paid NPM account.

#### Post-Publishing

Once published, users can install with:

```bash
npm install @trendtri/medusa-plugin-printify
```

---

## Fixed Configuration

The following changes were made to fix the publishing issue:

### 1. Added `exports` to package.json

```json
{
  "exports": {
    "./package.json": "./package.json",
    "./admin": "./dist/admin/index.js",
    "./modules/*": "./dist/modules/*/index.js",
    "./*": "./dist/*.js"
  }
}
```

### 2. Fixed tsconfig.json

Changed `rootDir` from `.` to `./src`:

```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

This ensures:
- Compiled files go to `dist/` instead of `dist/src/`
- Test files aren't compiled into the distribution
- Proper directory structure for exports

### 3. Created admin/index.ts

Added `src/admin/index.ts` to export all admin widgets:

```typescript
export * from './widgets'
```

This ensures the admin export path (`./admin`) works correctly.

---

## Development Workflow

### For Active Development

```bash
# In plugin directory
yalc publish
yalc push --watch

# In Medusa app directory
yalc add @trendtri/medusa-plugin-printify
npm run dev
```

### For Testing Changes

```bash
# In plugin directory
npm run build
yalc push

# Medusa app will auto-reload if watching
```

### For Publishing Updates

```bash
# Ensure tests pass
npm test

# Build
npm run build

# Update version
npm version patch

# Publish to NPM
npm publish --access public
```

---

## Troubleshooting

### Error: "cmd is not a function"

**Solution**: Don't use `npx medusa plugin:publish`. Use `yalc publish` instead.

### Plugin Not Updating in Medusa App

**Solution**:
```bash
# In plugin directory
yalc push

# Or in Medusa app
yalc update
```

### Build Errors

**Solution**: Ensure tsconfig has correct paths:
```json
{
  "rootDir": "./src",
  "outDir": "./dist"
}
```

### Missing Admin Widgets

**Solution**: Verify `dist/admin/index.js` exists and `package.json` has correct exports.

---

## Summary

✅ **Fixed Issues**:
- TypeScript compilation now outputs to `dist/` correctly
- Added proper package.json exports
- Created admin index for widget exports
- Can publish locally with yalc
- Can publish publicly with npm

✅ **Recommended Workflow**:
- Use `yalc` for local development and testing
- Use `npm publish` for public distribution
- Don't use `npx medusa plugin:publish` (requires official template)

The plugin is now ready for both local testing and NPM publishing!
