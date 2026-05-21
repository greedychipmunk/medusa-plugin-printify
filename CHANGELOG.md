# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Future entries are appended automatically by the release workflow based on
merged PR titles (see [CONTRIBUTING.md](CONTRIBUTING.md#conventional-commit-titles)).

## [Unreleased]

## [0.2.0] - 2026-05-19

### Added
- Idempotent backfill script to reconcile Medusa product status with Printify (`feat(printify)`).
- Multi-currency pricing: `currency-converter` utility, `buildVariantPrices` helper, integrated into the product sync workflow.
- Option mapping: `option-mapper` helper extracts Printify variant options into separate Medusa options on create and re-sync.

### Changed
- Variant prices now respect Printify cents → Medusa amount conversion.
- Product sync uses Printify CDN URLs directly (reverted earlier S3 image-sync path).

### Fixed
- Demote Medusa product to `draft` when the corresponding Printify product is unpublished or deleted.
- Sales-channel link is now guaranteed on the product update path; previously-silent failures are surfaced as actionable error logs.
- Inline variant images that caused `createProductsWorkflow` to fail are no longer sent.
- Exchange-rate fallback for USD-only regions.
- Handling of all-disabled-variants and deduplication of option values.

## [0.1.0] - 2026-03

### Added
- Initial public release: product sync, order submission, webhook handling, Medusa Admin pages and order detail widget.

[Unreleased]: https://github.com/greedychipmunk/medusa-plugin-printify/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/greedychipmunk/medusa-plugin-printify/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/greedychipmunk/medusa-plugin-printify/releases/tag/v0.1.0
