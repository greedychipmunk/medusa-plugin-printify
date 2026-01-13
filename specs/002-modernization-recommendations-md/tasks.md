# Tasks: MedusaJS Plugin Modernization to v2.11.0+

**Input**: Design documents from `/specs/002-modernization-recommendations-md/`
**Prerequisites**: plan.md (tech stack), spec.md (user stories), research.md (decisions), data-model.md (entities), contracts/api.yaml (endpoints)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create `replace-imports.js` codemod script in project root per research.md specifications
- [ ] T002 [P] Backup current `src/` and `tests/` directories before modernization
- [ ] T003 [P] Update `.gitignore` to include modernization temporary files

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Run replace-imports codemod to update all import statements to @medusajs/framework paths
- [ ] T005 Clean up package.json by removing consolidated dependencies (@mikro-orm/*, awilix, pg, etc.)
- [ ] T006 [P] Install updated @medusajs/framework dependency and verify version compatibility
- [ ] T007 [P] Update TypeScript compilation to verify no import errors exist
- [ ] T008 Create base error handling using MedusaJS error patterns in `src/utils/error-handling.ts`
- [ ] T009 Update environment configuration loading in `src/config/env.ts` to use framework patterns

**Checkpoint**: Foundation ready - import consolidation complete, no TypeScript errors, basic infrastructure updated

---

## Phase 3: User Story 1 - Critical Compatibility Updates (Priority: P1) 🎯 MVP

**Goal**: Update API route handlers and plugin patterns to ensure MedusaJS v2.11.0+ compatibility with zero breaking changes

**Independent Test**: Install plugin in fresh MedusaJS v2.11.0+ installation and verify all admin endpoints respond correctly

### Implementation for User Story 1

- [ ] T010 [P] [US1] Update API route type imports in `src/api/admin/printify/config/route.ts` to use MedusaJS framework types
- [ ] T011 [P] [US1] Update API route type imports in `src/api/admin/printify/orders/route.ts` to use AuthenticatedMedusaRequest/MedusaResponse
- [ ] T012 [P] [US1] Update API route type imports in `src/api/admin/printify/orders/[id]/route.ts` to use framework types
- [ ] T013 [P] [US1] Update API route type imports in `src/api/admin/printify/orders/stats/route.ts` to use framework types
- [ ] T014 [P] [US1] Update API route type imports in `src/api/admin/printify/products/route.ts` to use framework types
- [ ] T015 [P] [US1] Update API route type imports in `src/api/admin/printify/products/[id]/disable/route.ts` to use framework types
- [ ] T016 [P] [US1] Update API route type imports in `src/api/admin/printify/products/[id]/enable/route.ts` to use framework types
- [ ] T017 [P] [US1] Update API route type imports in `src/api/admin/printify/products/bulk-operations/route.ts` to use framework types
- [ ] T018 [US1] Replace custom AdminRequest interface with AuthenticatedMedusaRequest in all API routes
- [ ] T019 [US1] Update route handler signatures from named exports to HTTP method exports (GET, POST, PUT, DELETE)
- [ ] T020 [US1] Replace req.user?.store_id access patterns with req.auth_context?.actor_id throughout API routes
- [ ] T021 [US1] Update validation patterns to use validateAndTransformQuery and validateAndTransformBody from @medusajs/framework/utils
- [ ] T022 [US1] Replace custom error throwing with MedusaError classes from @medusajs/framework/utils
- [ ] T023 [US1] Update response patterns from res.status().json() to res.json() for consistency
- [ ] T024 [US1] Test all admin API endpoints respond correctly with new patterns

**Checkpoint**: At this point, User Story 1 should be fully functional - all API routes work with MedusaJS v2.11.0+ types

---

## Phase 4: User Story 2 - Service Architecture Modernization (Priority: P2)

**Goal**: Modernize module definitions, data models, and service patterns to leverage MedusaJS dependency injection and ORM features

**Independent Test**: Verify services can be resolved through MedusaJS DI container and database operations use MedusaJS ORM instead of custom SQL

### Implementation for User Story 2

- [ ] T025 [P] [US2] Create PrintifyConfiguration data model using MedusaJS DML in `src/modules/printify/models/printify-configuration.ts`
- [ ] T026 [P] [US2] Create PrintifyProduct data model using MedusaJS DML in `src/modules/printify/models/printify-product.ts`
- [ ] T027 [P] [US2] Create PrintifyProductVariant data model using MedusaJS DML in `src/modules/printify/models/printify-product-variant.ts`
- [ ] T028 [P] [US2] Create PrintifyOrder data model using MedusaJS DML in `src/modules/printify/models/printify-order.ts`
- [ ] T029 [P] [US2] Create PrintifyCartItem data model using MedusaJS DML in `src/modules/printify/models/printify-cart-item.ts`
- [ ] T030 [P] [US2] Create ProductEnablementHistory data model using MedusaJS DML in `src/modules/printify/models/product-enablement-history.ts`
- [ ] T031 [P] [US2] Create SyncLog data model using MedusaJS DML in `src/modules/printify/models/sync-log.ts`
- [ ] T032 [US2] Define model relationships in data model files using belongsTo/hasMany patterns
- [ ] T033 [US2] Generate automatic migrations using `npx medusa db:generate` command
- [ ] T034 [US2] Create modern module definition in `src/modules/printify/index.ts` using Module pattern
- [ ] T035 [US2] Update PrintifyModuleService to extend MedusaService with model repositories in `src/modules/printify/services/printify-module-service.ts`
- [ ] T036 [US2] Update PrintifyApiClient service to use dependency injection in `src/modules/printify/services/printify-api-client.ts`
- [ ] T037 [US2] Update PrintifyConfigurationService to use dependency injection in `src/modules/printify/services/printify-configuration-service.ts`
- [ ] T038 [US2] Update PrintifyProductService to use dependency injection in `src/modules/printify/services/printify-product-service.ts`
- [ ] T039 [US2] Update PrintifyOrderService to use dependency injection in `src/modules/printify/services/printify-order-service.ts`
- [ ] T040 [US2] Update API routes to use dependency injection service resolution with req.scope.resolve()
- [ ] T041 [US2] Remove custom migration files from `src/modules/printify/migrations/` after data migration
- [ ] T042 [US2] Update database operations in services to use model methods instead of custom SQL queries
- [ ] T043 [US2] Test service resolution works correctly through MedusaJS DI container

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently with modern service architecture

---

## Phase 5: User Story 3 - Enhanced Developer Experience (Priority: P3)

**Goal**: Add workflow integration, modern testing patterns, and updated admin widgets for improved maintainability

**Independent Test**: Execute workflow-based sync operations and run tests using MedusaJS testing utilities achieving 90%+ coverage

### Implementation for User Story 3

- [ ] T044 [P] [US3] Create sync products workflow definition in `src/workflows/sync-products.ts` using createWorkflow
- [ ] T045 [P] [US3] Create fetchPrintifyProductsStep workflow step with proper error handling
- [ ] T046 [P] [US3] Create syncProductBatchStep workflow step with compensation functions
- [ ] T047 [US3] Update PrintifyProductService.syncProducts to use workflow execution
- [ ] T048 [US3] Add workflow error handling and retry logic with proper compensation
- [ ] T049 [P] [US3] Update PrintifyConfigurationWidget in `src/admin/widgets/printify-configuration-widget.tsx` to use defineWidgetConfig
- [ ] T050 [P] [US3] Update PrintifyProductManagementWidget in `src/admin/widgets/printify-product-management-widget.tsx` to use modern admin SDK
- [ ] T051 [US3] Update widget registration in `src/admin/widgets/index.ts` with proper config exports
- [ ] T052 [US3] Install @medusajs/test-utils and @swc/jest for modern testing patterns
- [ ] T053 [US3] Update Jest configuration in `jest.config.js` to work with MedusaJS framework
- [ ] T054 [US3] Create integration test setup file in `tests/setup.ts` with MetadataStorage.clear()
- [ ] T055 [P] [US3] Update existing tests in `tests/unit/` to use modern testing patterns while preserving test logic
- [ ] T056 [P] [US3] Create integration tests for API endpoints using MedusaJS test runner
- [ ] T057 [P] [US3] Create integration tests for service layer using MedusaJS test utilities
- [ ] T058 [US3] Update test scripts in package.json to use new test categories (integration:http, integration:modules, unit)
- [ ] T059 [US3] Validate 90%+ test coverage is maintained after modernization

**Checkpoint**: All user stories should now be independently functional with enhanced developer experience

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final validation

- [ ] T060 [P] Update README.md with modernization changes and migration instructions
- [ ] T061 [P] Update plugin documentation to reflect new patterns and capabilities
- [ ] T062 [P] Create migration guide for existing users in `docs/migration/v2-modernization.md`
- [ ] T063 [US1,US2,US3] Run comprehensive validation using quickstart.md procedures
- [ ] T064 [US1,US2,US3] Performance testing to ensure <5% impact target is met
- [ ] T065 [P] Code cleanup and removal of deprecated patterns throughout codebase
- [ ] T066 [P] Security review of modernized authentication and error handling patterns
- [ ] T067 [US1,US2,US3] End-to-end testing of complete plugin functionality in MedusaJS v2.11.0+

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Integrates with US1 but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Builds on US1/US2 but independently testable

### Within Each User Story

- API route updates before validation pattern updates (US1)
- Data models before services (US2)
- Services before DI integration (US2)
- Workflow steps before workflow integration (US3)
- Widget updates before test updates (US3)
- Core implementation before integration testing

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- API route file updates within each user story marked [P] can run in parallel
- Data model creation tasks marked [P] can run in parallel
- Service updates marked [P] can run in parallel (within same story)

---

## Parallel Example: User Story 1

```bash
# Launch all API route type updates together:
Task: "Update API route type imports in src/api/admin/printify/config/route.ts"
Task: "Update API route type imports in src/api/admin/printify/orders/route.ts"
Task: "Update API route type imports in src/api/admin/printify/products/route.ts"
# ... all other route files in parallel
```

## Parallel Example: User Story 2

```bash
# Launch all data model creation together:
Task: "Create PrintifyConfiguration data model in src/modules/printify/models/printify-configuration.ts"
Task: "Create PrintifyProduct data model in src/modules/printify/models/printify-product.ts"
Task: "Create PrintifyProductVariant data model in src/modules/printify/models/printify-product-variant.ts"
# ... all other models in parallel
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently in MedusaJS v2.11.0+
5. Deploy/demo compatibility success

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready (import consolidation complete)
2. Add User Story 1 → Test independently → Deploy/Demo (MVP - MedusaJS v2.11.0+ compatible!)
3. Add User Story 2 → Test independently → Deploy/Demo (Modern architecture complete)
4. Add User Story 3 → Test independently → Deploy/Demo (Enhanced developer experience)
5. Each story adds value without breaking previous functionality

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Critical compatibility)
   - Developer B: User Story 2 (Service modernization) 
   - Developer C: User Story 3 (Developer experience)
3. Stories complete and integrate independently

---

## Summary

**Total Tasks**: 67 tasks
- **Setup**: 3 tasks
- **Foundational**: 6 tasks  
- **User Story 1** (Critical Compatibility): 15 tasks
- **User Story 2** (Service Architecture): 19 tasks
- **User Story 3** (Developer Experience): 16 tasks
- **Polish**: 8 tasks

**Parallel Opportunities**: 31 tasks marked [P] can run in parallel
**Independent Test Criteria**: Each user story has clear validation checkpoints
**Suggested MVP Scope**: User Story 1 (Critical Compatibility Updates) provides immediate MedusaJS v2.11.0+ compatibility

---

## Notes

- [P] tasks = different files, no dependencies - can run simultaneously
- [Story] label maps task to specific user story for traceability  
- Each user story should be independently completable and testable
- Focus on User Story 1 for MVP - provides immediate compatibility benefits
- User Stories 2 and 3 can be implemented later for enhanced functionality
- Stop at any checkpoint to validate story independently before proceeding
- Zero breaking changes maintained throughout all phases