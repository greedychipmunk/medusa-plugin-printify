# Public MIT release of `medusa-plugin-printify` — design

**Date:** 2026-05-20
**Status:** Approved
**Author:** Working session
**Repo:** `greedychipmunk/medusa-plugin-printify` (currently private)
**Target license:** MIT
**Target npm package:** `medusa-plugin-printify` (unchanged)

---

## Goal

Make the `medusa-plugin-printify` repository public under MIT, decoupled from all
TrendTri context, with no personally identifiable data in the working tree, and
present as an impressive open-source project to first-time visitors.

## Non-goals

- **Scrubbing git history.** Per user decision, this is explicitly out of scope.
  Historical commits will continue to show `Dawson Blackhouse <dcblackhouse@gmail.com>`
  as author and may contain TrendTri references in commit messages and removed
  files. Only the working tree of the public-facing branches must be clean.
- **Real admin-UI screenshots.** Placeholders only; real images are a follow-up.
- **Renaming the npm package.** Stays `medusa-plugin-printify`.

## Approach

Two PRs on top of the current `feat/github-actions-ci-cd` branch:

1. **PR #1 — `chore: decouple from internal context`**
   Sanitization-only. No functional code changes. Title is `chore:` so the release
   workflow does not bump the version on merge.

2. **PR #2 — `feat: add public-release scaffolding`**
   Additive only (LICENSE, badges, polish files, README facelift). Title is
   `feat:` so the release workflow bumps `0.2.x → 0.3.0` and publishes to npm
   on merge.

This ordering means the working tree is private-safe **before** the public-facing
polish is applied, and the first version that hits npm with full polish is also
the first version cut after the repo's privacy boundary moves.

After both PRs merge to `main`, repo visibility is flipped to public on github.com
(manual step — not in any PR).

---

## PR #1 — Sanitization

### Working-tree changes

| File / dir | Action |
|---|---|
| `package.json#author` | `"TrendTri"` → `"Dawson Blackhouse"` |
| `package.json` | Add `repository`, `bugs`, `homepage` pointing to `greedychipmunk/medusa-plugin-printify` (postponed to PR #2 if cleaner there — see Open questions). |
| `AGENTS.md` | Replace the "three-repository platform" block (lines ~9–15) — the one referencing `../trendtri/` and `../nextjs-trendtri/` — with a single paragraph: *"This plugin is consumed by a Medusa v2 application. See the Medusa plugin docs for how to register and run it inside a host app."* |
| `docs/` (entire directory) | Move to a local orphan branch `internal-archive`, then delete from the working tree of `feat/github-actions-ci-cd`. This includes `create_plugin.md`, `llms.txt`, `plans/**`, `superpowers/specs/**`, `superpowers/plans/**`, `superpowers/runbooks/**` — and including this design doc itself, which is part of the archived material. |

The `internal-archive` branch is **local-only** and never pushed. To safeguard
against accidental push, the runbook in the implementation plan will include
`git config --local --add remote.origin.push 'refs/heads/main:refs/heads/main'`
(or similar restrictive push-spec) and an explicit instruction to verify the
remote branches before going public.

### Out-of-band manual steps (not in any commit)

1. **Rotate the Printify personal access token.** The current value in `.env`
   (gitignored, never committed) is for shop ID `26547087` against
   `https://trendtriumph.com/webhooks/printify`. Even though it is not in git,
   the file lives on a machine that may be backed up, screen-shared, or
   otherwise leaked. Generate a fresh token at
   <https://printify.com/app/account/api> and update local `.env` only.
2. **Rotate the webhook secret** in `.env` for the same reason.

### Verification (must pass before PR #1 merges)

```bash
# Run from repo root. Expected: zero matches.
grep -rin "trendtri\|dcblackhouse\|/Users/dcblackhouse\|trendtriumph" \
  --include="*.md" --include="*.json" --include="*.ts" --include="*.tsx" \
  --include="*.yml" --include="*.yaml" --include="*.template" --include="*.toml" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.medusa \
  --exclude-dir=coverage --exclude-dir=dist
```

```bash
# Expected: docs/ directory does not exist (or is empty)
ls -la docs/ 2>&1 | head -5
```

```bash
# Confirm orphan branch holds the archived material
git log internal-archive --oneline | head -3
git ls-tree -r internal-archive --name-only | head -20
```

```bash
# Confirm the orphan branch is not on the remote
git ls-remote --heads origin internal-archive
# Expected: no output
```

```bash
# Smoke-test that the build still works after docs/ removal
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

---

## PR #2 — Public-release scaffolding

All additions. No deletions. No source-code modifications other than the README.

### New root-level files

| File | Content summary |
|---|---|
| `LICENSE` | Standard MIT text, `Copyright (c) 2026 Dawson Blackhouse`. |
| `CONTRIBUTING.md` | Sections: Code of Conduct link, local dev setup (mirrors README), conventional-commit PR titles + how they drive `release.yml`, test/build/PR checklist. |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1, unmodified standard text. Contact channel: GitHub Issues. |
| `SECURITY.md` | Reporting: GitHub private security advisories. Supported versions: `0.x: ✅`. Response SLA: "best-effort, hobbyist project". |
| `CHANGELOG.md` | [Keep a Changelog](https://keepachangelog.com/) format. Seeded with `0.2.0` and prior entries derived from git tags. Forward entries auto-driven by PR titles via `release.yml`. |
| `docs/` | Recreated as a public-docs directory (was deleted in PR #1). New contents: `docs/screenshots/.gitkeep` only. |

### New `.github/` files

| File | Content summary |
|---|---|
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Form: Medusa version, plugin version, repro steps, expected/actual, logs, environment. |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Form: problem, proposed solution, alternatives considered. |
| `.github/ISSUE_TEMPLATE/config.yml` | `blank_issues_enabled: false`. No Discussions link unless user enables Discussions later. |
| `.github/dependabot.yml` | Weekly `npm` updates. Group all `@medusajs/*` packages together. Group all other dev dependencies together. Group GitHub Actions updates. Open as `chore(deps):` PRs. |
| `.github/FUNDING.yml` | **Omitted** unless user later opts in. Sponsor button is a separate decision. |

### `package.json` enrichment

```jsonc
{
  "name": "medusa-plugin-printify",
  "version": "0.2.0",
  "description": "Printify print-on-demand integration plugin for Medusa v2",
  "author": "Dawson Blackhouse",
  "license": "MIT",
  "homepage": "https://github.com/greedychipmunk/medusa-plugin-printify#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/greedychipmunk/medusa-plugin-printify.git"
  },
  "bugs": {
    "url": "https://github.com/greedychipmunk/medusa-plugin-printify/issues"
  },
  "keywords": [
    "medusa",
    "medusa-v2",
    "medusa-plugin",
    "medusa-plugin-other",
    "printify",
    "print-on-demand",
    "pod",
    "dropshipping",
    "ecommerce",
    "fulfillment",
    "webhooks"
  ]
  // ... existing fields unchanged
}
```

The `version-field-guard` job in `ci.yml` will object if `version` changes in a
PR. Since PR #2 does not touch `version` (release.yml bumps it on merge), this
is fine — but the implementation plan will explicitly call out: *do not edit
`version` by hand*.

### CI augmentation

`.github/workflows/ci.yml`, in the `test` job after the existing `Run Jest tests`
step:

```yaml
      - name: Run Jest tests with coverage
        run: pnpm test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          fail_ci_if_error: false
```

(Replaces the existing `Run Jest tests` step rather than adding alongside it,
so coverage is generated in the same run.)

**Manual step (runbook, not code):** add `CODECOV_TOKEN` to repo secrets at
github.com after creating a Codecov project at codecov.io. Until that's wired,
the Codecov upload soft-fails (`fail_ci_if_error: false`) and the Codecov badge
in the README will show "unknown" rather than breaking CI.

### README rewrite

Restructured to the following shape. Existing technical content (Requirements,
Installation, Configuration, Local Development, Production Deployment, API
Reference, Order Fulfillment Flow, Admin Dashboard) is preserved verbatim
inside the lower sections — only the header, intro, and structural framing
change.

```
<p align="center">
  <!-- logo placeholder; can be replaced with an SVG later -->
  <strong style="font-size: 2em">medusa-plugin-printify</strong>
</p>

<p align="center">
  Print-on-demand fulfillment for <a href="https://medusajs.com">Medusa v2</a>,
  powered by <a href="https://printify.com">Printify</a>.
</p>

<p align="center">
  <a href="https://npmjs.com/package/medusa-plugin-printify"><img src="https://img.shields.io/npm/v/medusa-plugin-printify.svg" alt="npm version" /></a>
  <a href="https://npmjs.com/package/medusa-plugin-printify"><img src="https://img.shields.io/npm/dm/medusa-plugin-printify.svg" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/greedychipmunk/medusa-plugin-printify/actions/workflows/ci.yml"><img src="https://github.com/greedychipmunk/medusa-plugin-printify/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://codecov.io/gh/greedychipmunk/medusa-plugin-printify"><img src="https://codecov.io/gh/greedychipmunk/medusa-plugin-printify/branch/main/graph/badge.svg" alt="coverage" /></a>
  <a href="https://medusajs.com"><img src="https://img.shields.io/badge/Medusa-v2-blueviolet" alt="Medusa v2" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#api-reference">API</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## Why this plugin

- **Real fulfillment, not just sync** — automatic order submission, real-time
  webhook status, and a Medusa Admin widget that surfaces production state on
  every order page.
- **Type-safe, tested, and CI-driven** — TypeScript strict mode, Jest coverage,
  and OIDC-signed npm releases driven by conventional-commit PR titles.
- **Decoupled and unopinionated** — no storefront assumptions; works with any
  Medusa v2 host application.

## Features

[existing bullets, lightly tightened]

## Screenshots

<!-- Placeholders — replace with real screenshots when available -->
| Printify dashboard | Synced products | Order detail widget |
|---|---|---|
| ![Printify dashboard](docs/screenshots/dashboard.png) | ![Products](docs/screenshots/products.png) | ![Order widget](docs/screenshots/order-widget.png) |

## Quick start

```bash
pnpm add medusa-plugin-printify
```

Add to `medusa-config.ts`:

```ts
plugins: [
  {
    resolve: "medusa-plugin-printify",
    options: {
      apiKey: process.env.PRINTIFY_API_KEY,
      webhookSecret: process.env.PRINTIFY_WEBHOOK_SECRET,
      shopId: process.env.PRINTIFY_SHOP_ID,
      webhookBaseUrl: process.env.PRINTIFY_WEBHOOK_URL,
    },
  },
]
```

```bash
pnpm medusa db:migrate
```

Done. See [Configuration](#configuration) for all options.

## Table of contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [API Reference](#api-reference)
- [Order Fulfillment Flow](#order-fulfillment-flow)
- [Admin Dashboard](#admin-dashboard)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

[existing long-form sections, unchanged]

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup. PR titles must
follow [Conventional Commits](https://www.conventionalcommits.org/) — the
release workflow uses them to bump versions automatically.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

MIT © Dawson Blackhouse
```

### Verification (must pass before PR #2 merges)

```bash
# All polish files present
ls LICENSE CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md CHANGELOG.md
ls .github/ISSUE_TEMPLATE/bug_report.yml \
   .github/ISSUE_TEMPLATE/feature_request.yml \
   .github/ISSUE_TEMPLATE/config.yml \
   .github/dependabot.yml
ls docs/screenshots/.gitkeep
```

```bash
# Badges resolve (HEAD requests, expect 200/302)
curl -sI https://img.shields.io/npm/v/medusa-plugin-printify.svg | head -1
curl -sI https://github.com/greedychipmunk/medusa-plugin-printify/actions/workflows/ci.yml/badge.svg | head -1
```

```bash
# Sanitization still holds (re-run from PR #1)
grep -rin "trendtri\|dcblackhouse\|/Users/dcblackhouse\|trendtriumph" \
  --include="*.md" --include="*.json" --include="*.ts" --include="*.tsx" \
  --include="*.yml" --include="*.yaml" --include="*.template" --include="*.toml" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.medusa \
  --exclude-dir=coverage --exclude-dir=dist
# Expected: zero matches
```

```bash
# Existing CI still green
pnpm install --frozen-lockfile && pnpm test && pnpm build
```

---

## Post-merge runbook (manual, after both PRs land on `main`)

1. Confirm release workflow published `0.3.0` to npm:
   `npm view medusa-plugin-printify version`
2. Confirm the published package on npmjs.com shows the provenance badge.
3. Flip repo visibility to **public** at
   `https://github.com/greedychipmunk/medusa-plugin-printify/settings`.
4. (Optional) Enable GitHub Discussions if community Q&A is desired; if so,
   re-edit `.github/ISSUE_TEMPLATE/config.yml` to link to it.
5. Create a Codecov project for the repo and add the `CODECOV_TOKEN` secret
   to GitHub repo settings. Coverage badge will then start reporting.
6. (Optional, future) Add a logo SVG to `docs/screenshots/` and replace the
   `<strong>` placeholder in the README header.
7. (Optional, future) Capture real admin-UI screenshots and replace the
   placeholder image paths.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| The `internal-archive` orphan branch gets pushed accidentally. | Push-spec restriction in the runbook; explicit `git ls-remote --heads origin` verification step. As an extra safety net, contents of `docs/` could also be copied to a location outside the repo (e.g., `~/Code/medusa-plugin-printify-archive/`) before deletion. |
| Codecov badge shows "unknown" indefinitely because the manual setup step is forgotten. | `fail_ci_if_error: false` keeps CI green. Runbook step is explicit. |
| The release workflow tries to publish but the npm registry rejects (e.g., package already taken). | Run `npm view medusa-plugin-printify` before PR #2 merges to confirm namespace ownership. If conflict, pick a new name and update README/badges before merge. |
| Conventional-commit PR title for PR #1 (`chore:`) accidentally triggers a release. | `release.yml` only bumps on `feat`/`fix`/`feat!` titles per the `compute-bump.sh` script. Verified by reading `.github/scripts/compute-bump.sh` during implementation. |
| User edits `package.json#version` by hand during PR #2. | `version-field-guard` CI job rejects the PR with a clear error message. |

---

## Open questions

- Whether to add `repository`/`bugs`/`homepage` fields in PR #1 (alongside the
  `author` rename) or defer to PR #2 (alongside badges). Currently spec'd in
  PR #2 — simpler grouping. The implementation plan can decide based on diff
  size.
- Whether to seed `CHANGELOG.md` from existing git tags automatically (using
  `git-cliff` or similar) or write it by hand. Hand-written is simpler and
  the historical entries don't need to be precise. Spec'd as hand-written.
