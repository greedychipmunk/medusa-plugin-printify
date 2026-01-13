# Fix for "TypeError: The 'id' argument must be of type string. Received undefined"

## Problem Explanation

The error occurs because **`npx medusa plugin:publish` is designed ONLY for plugins created with the official MedusaJS plugin template** (`npx create-medusa-app my-plugin --plugin`).

When you run `npx medusa plugin:publish`, the MedusaJS CLI tries to:
1. Look for command modules in `node_modules/@medusajs/medusa/commands/plugin/`
2. Require those command modules to execute the publish logic

Since this plugin was created manually (not from the template), this structure doesn't exist, causing the error.

### The Error Chain:
```
1. CLI calls: resolveLocalCommand("plugin/publish")
2. Tries to require: @medusajs/medusa/commands/plugin/publish
3. Module not found → cmdPath is undefined
4. require(undefined) → "The 'id' argument must be of type string"
```

## ✅ Solution: Use NPM Scripts Instead

I've added **replacement scripts** to `package.json` that accomplish the same thing using `yalc` directly:

### Available Commands

#### 1. Publish to Local Registry (Replaces `medusa plugin:publish`)
```bash
npm run plugin:publish
```

This runs:
- `npm run build` - Compiles TypeScript
- `yalc publish` - Publishes to local registry

#### 2. Push Updates to Linked Apps
```bash
npm run plugin:push
```

This runs:
- `npm run build` - Compiles TypeScript
- `yalc push` - Pushes updates to all linked Medusa apps

#### 3. Watch Mode for Development
```bash
npm run plugin:watch
```

This runs:
- `yalc push --watch` - Watches for changes and auto-pushes updates

### Quick Start Guide

**Step 1: Install Yalc (one-time setup)**
```bash
npm install -g yalc
```

**Step 2: Publish Plugin Locally**
```bash
npm run plugin:publish
```

**Step 3: Add to Your Medusa App**
```bash
cd /path/to/your-medusa-app
yalc add @trendtri/medusa-plugin-printify
```

**Step 4: Register in medusa-config.ts**
```typescript
export default defineConfig({
  plugins: [
    {
      resolve: "@trendtri/medusa-plugin-printify",
      options: {
        // your options
      },
    },
  ],
})
```

**Step 5: Development Workflow**

In **plugin directory** (watch for changes):
```bash
npm run plugin:watch
```

In **Medusa app** (run development server):
```bash
npm run dev
```

Now any changes to the plugin will automatically update in your Medusa app!

---

## Alternative: Shell Script

I've also created `scripts/publish-local.sh` for those who prefer shell scripts:

```bash
./scripts/publish-local.sh
```

This does the same as `npm run plugin:publish` with helpful output messages.

---

## Why This Happens

### Official Template Structure
Plugins created with `npx create-medusa-app my-plugin --plugin` have:
```
.medusa/
├── commands/
│   ├── plugin/
│   │   ├── publish.ts
│   │   ├── build.ts
│   │   └── develop.ts
└── server/
    └── ... compiled output
```

### Manual Plugin Structure (This Project)
```
dist/
├── admin/
├── modules/
└── index.js
```

The CLI commands expect the `.medusa` structure, which manual plugins don't have.

---

## Publishing to NPM (Public)

When you're ready to publish publicly:

```bash
# Build and test
npm run build
npm test

# Update version
npm version patch  # or minor/major

# Publish to NPM
npm publish
```

The `.npmrc` file I created ensures it's published as public.

---

## Summary

### ❌ Don't Use:
```bash
npx medusa plugin:publish  # Will fail with undefined error
npx medusa plugin:build    # Will fail with undefined error
npx medusa plugin:develop  # Will fail with undefined error
```

### ✅ Use Instead:
```bash
npm run plugin:publish  # Local publish
npm run plugin:push     # Push updates
npm run plugin:watch    # Watch mode
npm publish             # Public publish
```

Or use the shell script:
```bash
./scripts/publish-local.sh
```

---

## Root Cause (Technical Details)

The MedusaJS CLI (`@medusajs/cli`) has a function `resolveLocalCommand` that:

```javascript
function resolveLocalCommand(command) {
  try {
    const cmdPath = require.resolve(`@medusajs/medusa/commands/${command}`)
    return require(cmdPath).default
  } catch (err) {
    // cmdPath is undefined → require(undefined) → error
  }
}
```

For `plugin:publish`, it looks for `@medusajs/medusa/commands/plugin/publish`, which only exists:
1. In full Medusa applications (for app-level commands)
2. In plugins created with the official template (in `.medusa/commands/`)

Since this plugin was manually created, neither location exists.

**The fix is to not use the Medusa CLI commands at all** - use the NPM scripts or yalc directly.
