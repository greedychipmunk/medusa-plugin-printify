# MedusaJS v2.11.0+ Modernization Research

**Date**: January 9, 2026  
**Status**: Complete  
**Source**: Official MedusaJS documentation and framework patterns

## Research Findings Summary

This research resolves all technical unknowns for modernizing the MedusaJS Printify plugin to v2.11.0+ compatibility. All decisions are based on authoritative MedusaJS documentation and official migration guidance.

---

## 1. Import Consolidation (CRITICAL)

### **Decision**: Use official replace-imports codemod and update to @medusajs/framework paths

### **Rationale**: 
MedusaJS v2.11.0+ consolidated external packages into `@medusajs/framework` to optimize package structure and simplify dependency management. This is a mandatory breaking change.

### **Alternatives Considered**:
- Manual import updates: Too error-prone and time-consuming for comprehensive changes
- Maintaining old imports: Will cause hard failures in v2.11.0+ as packages are removed

### **Implementation Details**:

**Required Codemod**: Create `replace-imports.js` in project root with official MedusaJS script
**Key Import Mappings**:
- `@mikro-orm/*` → `@medusajs/framework/mikro-orm/{subpath}`
- `awilix` → `@medusajs/framework/awilix`  
- `pg` → `@medusajs/framework/pg`
- Express types → MedusaJS framework types

**Package.json Cleanup**: Remove consolidated dependencies:
- All `@mikro-orm/*` packages
- `awilix`
- `pg`
- OpenTelemetry packages

---

## 2. Plugin Architecture Patterns

### **Decision**: Maintain current plugin registration pattern (no changes required)

### **Rationale**: 
Research confirms the current plugin structure follows standard MedusaJS patterns. There is no "definePlugin" pattern in MedusaJS - this was a misunderstanding from the initial recommendations.

### **Alternatives Considered**:
- Custom plugin definition patterns: Not supported by MedusaJS framework
- Module-only approach: Would lose plugin benefits and admin widget capabilities

### **Implementation Details**:

**Current Pattern Validated**: The existing medusa-config.ts registration is correct:
```typescript
plugins: [
  {
    resolve: "./src",
    options: { /* plugin options */ }
  }
]
```

**Standard Plugin Structure**:
- Plugin resources exported from `src/index.ts`
- Module definitions in `src/modules/`
- API routes in `src/api/`
- Admin widgets in `src/admin/`

---

## 3. API Route Handler Modernization

### **Decision**: Update to MedusaJS framework request/response types with authentication patterns

### **Rationale**: 
MedusaJS provides framework-specific types that integrate with built-in authentication, validation, and error handling systems, providing better type safety and functionality than raw Express types.

### **Alternatives Considered**:
- Express types: Don't integrate with MedusaJS authentication and validation features
- Custom authentication handling: Duplicates framework capabilities unnecessarily

### **Implementation Details**:

**Required Imports**:
```typescript
import type { 
  MedusaRequest, 
  MedusaResponse,
  AuthenticatedMedusaRequest 
} from "@medusajs/framework/http"
```

**Modern Route Pattern**:
```typescript
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const actorId = req.auth_context?.actor_id
  // Implementation
  return res.json({ data: result })
}
```

**Validation and Error Handling**:
```typescript
import { validateAndTransformQuery, MedusaError } from "@medusajs/framework/utils"
```

---

## 4. Data Models vs Custom Migrations

### **Decision**: Migrate to MedusaJS Data Model Language (DML) with automatic migration generation

### **Rationale**: 
DML provides automatic migration generation, better ORM integration, simplified relationship management, and alignment with MedusaJS data patterns.

### **Alternatives Considered**:
- Custom SQL migrations: Require manual maintenance and don't integrate with MedusaJS ORM
- Direct database queries: No framework integration or type safety

### **Implementation Details**:

**Data Model Definition Pattern**:
```typescript
import { model } from "@medusajs/framework/utils"

export const PrintifyConfiguration = model.define("printify_configuration", {
  id: model.id().primaryKey(),
  store_id: model.text().index(),
  printify_api_key: model.text(),
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

**Migration Generation**: Use `npx medusa db:generate` for automatic migration creation
**Legacy Migration Removal**: Delete custom SQL migration files after model conversion

---

## 5. Service Dependency Injection Patterns

### **Decision**: Use MedusaJS Module system with container resolution

### **Rationale**: 
MedusaJS provides built-in dependency injection through modules and the Medusa container, offering automatic service registration and resolution without external dependencies.

### **Alternatives Considered**:
- Manual service instantiation: Doesn't leverage framework capabilities
- External DI containers: Conflicts with MedusaJS patterns and adds unnecessary complexity

### **Implementation Details**:

**Module Definition**:
```typescript
import { Module } from "@medusajs/framework/utils"

export default Module("printify", {
  service: PrintifyModuleService,
})
```

**Container Resolution**:
```typescript
// In API routes
const printifyService = req.scope.resolve("printify")

// In workflows  
const printifyService = container.resolve("printify")
```

**Service Pattern**:
```typescript
import { MedusaService } from "@medusajs/framework/utils"

class PrintifyModuleService extends MedusaService({
  PrintifyProduct,
  PrintifyConfiguration
}) {
  // Custom business logic
}
```

---

## 6. Testing Framework Integration

### **Decision**: Use @medusajs/test-utils with Jest for integration testing

### **Rationale**: 
Official MedusaJS testing framework provides integration testing capabilities specifically designed for the framework, ensuring proper container setup and module loading.

### **Alternatives Considered**:
- Custom testing setup: No framework integration or proper container initialization
- Other testing frameworks: Don't integrate with MedusaJS module system

### **Implementation Details**:

**Required Dependencies**:
- `@medusajs/test-utils` (integration tests)
- Standard Jest setup (unit tests)
- `@swc/jest` for TypeScript transformation

**Test Categories**:
- `test:integration:http` - API routes and HTTP workflows
- `test:integration:modules` - Module-specific business logic
- `test:unit` - Standard Jest unit tests

**Framework Integration**: Only works for integration tests; unit tests use standard Jest patterns

---

## Research Validation

### **Sources Verified**:
- ✅ Official MedusaJS v2.11.0+ documentation
- ✅ Framework migration guides and codemods
- ✅ Plugin development patterns and examples
- ✅ Data model and testing framework documentation

### **Unknowns Resolved**:
- ✅ Import consolidation patterns and codemod usage
- ✅ Plugin architecture validation (no changes needed)
- ✅ API route modernization with framework types
- ✅ Data model migration from custom SQL to DML
- ✅ Dependency injection through module system
- ✅ Testing integration with framework utilities

### **Implementation Readiness**: 
All technical decisions are backed by official documentation and provide clear implementation pathways for the modernization effort.