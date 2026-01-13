# Quick Start: Local Plugin Development

## Problem Solved

If you see this error:
```
TypeError: The "id" argument must be of type string. Received undefined
```

When running `npx medusa plugin:publish`, **don't worry** - this is expected for manually created plugins.

## ✅ Solution (3 Simple Steps)

### 1. Publish Plugin Locally

In the **plugin directory**:
```bash
npm run plugin:publish
```

This compiles and publishes the plugin to your local registry.

### 2. Install in Medusa App

Navigate to your Medusa application:
```bash
cd /path/to/your-medusa-app
yalc add @trendtri/medusa-plugin-printify
```

### 3. Register Plugin

Add to `medusa-config.ts`:
```typescript
export default defineConfig({
  plugins: [
    {
      resolve: "@trendtri/medusa-plugin-printify",
      options: {
        printify: {
          apiKey: process.env.PRINTIFY_API_KEY,
          shopId: process.env.PRINTIFY_SHOP_ID,
        },
      },
    },
  ],
})
```

## Development Workflow

### Option A: Watch Mode (Recommended)

Terminal 1 (Plugin):
```bash
npm run plugin:watch
```

Terminal 2 (Medusa App):
```bash
npm run dev
```

Now changes to the plugin automatically update in your Medusa app!

### Option B: Manual Push

After making changes in the plugin:
```bash
npm run plugin:push
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run plugin:publish` | Build and publish to local registry |
| `npm run plugin:push` | Push updates to linked Medusa apps |
| `npm run plugin:watch` | Auto-push on file changes |
| `npm run build` | Compile TypeScript only |
| `npm test` | Run test suite |

## Publishing to NPM (Production)

When ready for production:

```bash
# Ensure tests pass
npm test

# Build
npm run build

# Bump version
npm version patch  # or minor/major

# Publish
npm publish
```

## Why Can't I Use `medusa plugin:publish`?

The Medusa CLI command `plugin:publish` only works for plugins created with:
```bash
npx create-medusa-app my-plugin --plugin
```

Since this plugin was created manually, it uses a different structure. The NPM scripts we've added (`npm run plugin:publish`, etc.) provide the same functionality using `yalc` directly.

## Need Help?

- Full explanation: [MEDUSA_CLI_FIX.md](./MEDUSA_CLI_FIX.md)
- Publishing guide: [PLUGIN_PUBLISHING_GUIDE.md](./PLUGIN_PUBLISHING_GUIDE.md)
- Widget redesign: [WIDGET_REDESIGN_SUMMARY.md](./WIDGET_REDESIGN_SUMMARY.md)

## TL;DR

❌ **Don't use:** `npx medusa plugin:publish`

✅ **Use instead:** `npm run plugin:publish`

That's it! Happy coding! 🚀
