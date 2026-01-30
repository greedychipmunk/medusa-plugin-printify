# Quickstart Guide: MedusaJS Printify Plugin Modernization

**Target Audience**: Developers implementing the modernization updates  
**Estimated Time**: 2-3 hours for critical updates, 1-2 weeks for full modernization  
**Prerequisites**: MedusaJS v2.11.0+, Node.js 18+, TypeScript 5.x

## Overview

This quickstart guide walks through the essential steps to modernize the MedusaJS Printify plugin for v2.11.0+ compatibility. Follow these steps in order for a successful migration.

---

## Phase 1: Critical Compatibility Updates (Required First)

### Step 1: Run Import Consolidation Codemod

**Priority**: CRITICAL - Must be done first to prevent build failures

1. **Create the replace-imports codemod script**:

```bash
# Create codemod in project root
cat > replace-imports.js << 'EOF'
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// This is the official MedusaJS replace-imports codemod
// Based on: https://docs.medusajs.com/learn/codemods/replace-imports

const importReplacements = {
  '@mikro-orm/core': '@medusajs/framework/mikro-orm/core',
  '@mikro-orm/postgresql': '@medusajs/framework/mikro-orm/postgresql',
  'awilix': '@medusajs/framework/awilix',
  'pg': '@medusajs/framework/pg',
  '@opentelemetry/instrumentation-pg': '@medusajs/framework/opentelemetry/instrumentation-pg',
  '@opentelemetry/resources': '@medusajs/framework/opentelemetry/resources',
  '@opentelemetry/sdk-node': '@medusajs/framework/opentelemetry/sdk-node',
  '@opentelemetry/sdk-trace-node': '@medusajs/framework/opentelemetry/sdk-trace-node'
};

function replaceImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  Object.entries(importReplacements).forEach(([oldImport, newImport]) => {
    const importRegex = new RegExp(`(['"])(${oldImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(\\1)`, 'g');
    if (content.match(importRegex)) {
      content = content.replace(importRegex, `$1${newImport}$3`);
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated imports in: ${filePath}`);
  }
}

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      processDirectory(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      replaceImports(fullPath);
    }
  });
}

console.log('Running MedusaJS import replacements...');
processDirectory('./src');
processDirectory('./tests');
console.log('Import replacement complete!');
EOF
```

2. **Run the codemod**:

```bash
node replace-imports.js
```

3. **Clean up package.json dependencies**:

```bash
npm uninstall @mikro-orm/core @mikro-orm/postgresql awilix pg @opentelemetry/instrumentation-pg @opentelemetry/resources @opentelemetry/sdk-node @opentelemetry/sdk-trace-node
```

### Step 2: Update API Route Types

**Priority**: HIGH - Required for MedusaJS v2.11.0+ compatibility

1. **Update route handler imports** in all files under `src/api/admin/printify/`:

```typescript
// Replace these imports:
import { Request, Response } from 'express';

// With these:
import type { 
  MedusaRequest, 
  MedusaResponse,
  AuthenticatedMedusaRequest 
} from "@medusajs/framework/http"
import { validateAndTransformQuery, validateAndTransformBody } from "@medusajs/framework/utils"
```

2. **Update route handler signatures**:

```typescript
// OLD pattern:
export async function listProducts(req: AdminRequest, res: Response): Promise<void> {
  const storeId = req.user?.store_id || 'default-store';
  // ...
  res.status(200).json({ success: true, data: result });
}

// NEW pattern:
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const actorId = req.auth_context?.actor_id;
  // ...
  return res.json({ products: result });
}
```

3. **Update validation patterns**:

```typescript
// OLD pattern:
const schema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().max(100).default(20),
});
const validated = schema.parse(req.query);

// NEW pattern:
const querySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().max(100).default(20),
});
const validated = validateAndTransformQuery(req.query, querySchema);
```

### Step 3: Test Critical Updates

```bash
# Install dependencies
npm install

# Run tests to verify no breaking changes
npm test

# Start development server to test functionality
npm run dev
```

**Verification Checklist**:
- [ ] No import errors on startup
- [ ] Admin API endpoints respond correctly
- [ ] Existing functionality preserved
- [ ] TypeScript compilation succeeds

---

## Phase 2: Data Model Modernization (Recommended)

### Step 4: Create Modern Data Models

1. **Install MedusaJS data model dependencies** (if not already present):

```bash
npm install @medusajs/framework
```

2. **Create new data model files** (example for PrintifyConfiguration):

```typescript
// src/modules/printify/models/printify-configuration.ts
import { model } from "@medusajs/framework/utils"

export const PrintifyConfiguration = model.define("printify_configuration", {
  id: model.id().primaryKey(),
  store_id: model.text().index(),
  printify_api_key: model.text(),
  printify_shop_id: model.text(),
  webhook_secret: model.text().nullable(),
  sync_enabled: model.boolean().default(true),
  sync_frequency: model.number().default(60),
  batch_size: model.number().default(100),
  created_at: model.dateTime().default(() => new Date()),
  updated_at: model.dateTime().default(() => new Date()),
}).indexes([
  {
    name: "IDX_printify_config_store",
    on: ["store_id"],
    unique: true
  }
])
```

3. **Generate automatic migrations**:

```bash
npx medusa db:generate
```

### Step 5: Update Module Definition

1. **Create modern module definition** (`src/modules/printify/index.ts`):

```typescript
import { Module } from "@medusajs/framework/utils"
import { PrintifyModuleService } from "./services"

export default Module("printify", {
  service: PrintifyModuleService,
})

export * from "./services"
export * from "./models"
```

2. **Update service patterns** to use dependency injection:

```typescript
// src/modules/printify/services/printify-module-service.ts
import { MedusaService } from "@medusajs/framework/utils"
import { PrintifyConfiguration, PrintifyProduct } from "../models"

class PrintifyModuleService extends MedusaService({
  PrintifyConfiguration,
  PrintifyProduct
}) {
  // Custom business logic using this.configurationRepository, etc.
}
```

---

## Phase 3: Advanced Features (Optional Enhancements)

### Step 6: Add Workflow Integration

1. **Create workflow definitions** (`src/workflows/sync-products.ts`):

```typescript
import { 
  createWorkflow, 
  createStep,
  WorkflowResponse 
} from "@medusajs/framework/workflows-sdk"

const syncProductsWorkflow = createWorkflow(
  "sync-products",
  (input: { configurationId: string; force?: boolean }) => {
    const products = fetchPrintifyProductsStep(input)
    const result = syncProductBatchStep({ products, configurationId: input.configurationId })
    
    return new WorkflowResponse(result)
  }
)
```

2. **Update services to use workflows**:

```typescript
public async syncProducts(options: SyncProductsOptions = {}): Promise<SyncResult> {
  const { result } = await syncProductsWorkflow.run({
    input: {
      configurationId: this.configurationId,
      force: options.force
    }
  })
  return result
}
```

### Step 7: Update Testing Framework

1. **Install MedusaJS testing utilities**:

```bash
npm install --save-dev @medusajs/test-utils @swc/jest
```

2. **Update test configuration** (`jest.config.js`):

```javascript
const { loadEnv } = require("@medusajs/framework/utils")
loadEnv("test", process.cwd())

module.exports = {
  transform: {
    "^.+\\.[jt]s$": ["@swc/jest", {
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        target: "es2021",
      },
    }],
  },
  testEnvironment: "node",
  setupFiles: ["./tests/setup.ts"],
}
```

---

## Troubleshooting Common Issues

### Import Errors After Codemod

**Problem**: Import errors for consolidated packages  
**Solution**: Ensure all old packages are uninstalled and `@medusajs/framework` is properly installed

```bash
npm uninstall [old-packages]
npm install @medusajs/framework
```

### Authentication Errors in API Routes

**Problem**: `req.user` is undefined  
**Solution**: Use `req.auth_context?.actor_id` instead of `req.user`

### Database Migration Issues

**Problem**: Migration failures during model conversion  
**Solution**: 
1. Backup existing data
2. Run migrations in development first
3. Test data integrity before production deployment

### Service Resolution Errors

**Problem**: Services not found in dependency injection container  
**Solution**: Verify module registration in plugin configuration and service exports

---

## Validation & Testing

### Final Validation Steps

1. **Functionality Testing**:
```bash
# Run full test suite
npm test

# Test API endpoints
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:9000/admin/printify/config
```

2. **Performance Testing**:
```bash
# Check startup time
time npm start

# Test sync performance with large product sets
# Monitor memory usage during operations
```

3. **Migration Verification**:
```bash
# Verify all data migrated correctly
# Check foreign key relationships
# Validate data integrity constraints
```

### Success Metrics

- [ ] Plugin loads successfully in MedusaJS v2.11.0+
- [ ] All API endpoints return expected responses
- [ ] No performance regression (< 5% impact)
- [ ] All tests pass with new patterns
- [ ] Database operations work correctly
- [ ] Admin widgets render properly

---

## Next Steps

After completing this modernization:

1. **Update Documentation**: Update README, API docs, and user guides
2. **Monitor Production**: Watch for any issues in production deployments
3. **Plan Future Enhancements**: Consider workflow integration and advanced features
4. **Community Support**: Provide migration guidance to plugin users

## Support & Resources

- **MedusaJS Documentation**: [docs.medusajs.com](https://docs.medusajs.com)
- **Migration Guide**: [MedusaJS v2 Migration](https://docs.medusajs.com/learn/migration)
- **Testing Framework**: [MedusaJS Testing](https://docs.medusajs.com/learn/testing)
- **Plugin Development**: [Plugin Development Guide](https://docs.medusajs.com/learn/fundamentals/plugins)

This quickstart guide provides the essential steps for successful modernization. Focus on Phase 1 for immediate compatibility, then implement Phase 2 and 3 as time and requirements allow.