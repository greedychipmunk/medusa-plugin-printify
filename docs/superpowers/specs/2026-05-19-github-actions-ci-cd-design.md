# GitHub Actions CI/CD for `medusa-plugin-printify`

**Status:** Approved design — ready for implementation planning
**Date:** 2026-05-19
**Repo:** `greedychipmunk/medusa-plugin-printify`

## Summary

Add two GitHub Actions workflows that (1) verify every PR with tests and a build, and (2) automatically publish a new npm version when a PR is merged to `main`. The version bump (`patch` / `minor` / `major`) is inferred from the PR title using conventional-commit prefixes. Authentication to npm uses Trusted Publishers (OIDC), so no long-lived `NPM_TOKEN` secret exists in GitHub.

## Goals

- Every PR runs tests and a build before it can merge.
- Bug-fix PRs (`fix:` title) auto-publish a patch release on merge.
- Feature PRs (`feat:` title) auto-publish a minor release on merge.
- Breaking-change PRs (`feat!:` title or `BREAKING CHANGE:` body) auto-publish a major release on merge.
- Non-release PRs (`chore:`, `docs:`, `test:`, `ci:`, `refactor:`, `style:`, anything unprefixed) merge silently with no release.
- No long-lived publish credentials in GitHub.
- Every published version has signed provenance attestation tying the tarball to a specific workflow run.

## Non-goals

- Multi-Node-version test matrix (engine is `>=20`; one version is sufficient).
- Pre-release / release-candidate channels.
- A separate generated `CHANGELOG.md` file (GitHub Release notes serve that role).
- Dependabot / Renovate configuration (orthogonal; can be added later).
- Any deploy target beyond the npm registry — "deploy" for an npm plugin means "publish to npm."

## Architecture

Two workflow files under `.github/workflows/`:

```
.github/
  workflows/
    ci.yml              # PR-time: tests, build, PR title lint
    release.yml         # post-merge: parse title, bump, publish, tag, release
  pull_request_template.md   # nudges contributors to the conventional title format
```

### `ci.yml` — PR-time verification

**Trigger:** `pull_request` (`opened`, `synchronize`, `reopened`) targeting `main`.

**Permissions:** `contents: read` only.

**Jobs:**

1. `test` — checkout → setup Node 20 + pnpm 10.18.3 → `pnpm install --frozen-lockfile` → `pnpm test` → `pnpm build` (which runs `medusa plugin:build`).
2. `pr-title-lint` — runs `amannn/action-semantic-pull-request`. Accepts these prefixes (case-sensitive, optional `(scope)`, optional `!` for breaking): `fix`, `feat`, `chore`, `docs`, `test`, `ci`, `refactor`, `style`, `perf`, `build`, `revert`. PRs whose title doesn't start with one of these (followed by `: ` or `!: `) fail this check before merge with a message suggesting the right prefix. Only `fix`, `feat`, and any prefix with `!` (or a `BREAKING CHANGE:` in the body) trigger releases at merge time; the rest are valid PR titles that just merge silently.
3. `version-field-guard` — fails the PR if its diff modifies the `version` field of `package.json`. CI is the sole authority on that field under this design; manual edits would race the bump step in `release.yml`.

All three jobs (`test`, `pr-title-lint`, `version-field-guard`) become required status checks on the `main` branch protection rule (configured in the GitHub UI, post-rollout).

### `release.yml` — Bump-and-publish on merge

**Trigger:** `pull_request` with type `closed`, gated by `if: github.event.pull_request.merged == true`. Direct pushes to `main` do not trigger a release (releases must go through PR review).

**Permissions:**
- `contents: write` — to push the version-bump commit and tag, and create the GitHub Release.
- `id-token: write` — to mint the OIDC token for npm Trusted Publisher exchange.

**Environment:** `npm-publish` (a GitHub Actions Environment configured with a branch restriction to `main`). The environment name is included in the OIDC token's `sub` claim and is what npm's Trusted Publisher config pins trust to.

**Concurrency:** `group: release`, `cancel-in-progress: false`. Serializes two near-simultaneous merges so the second reads the bumped `package.json` from the first.

**Job steps:**

1. **Checkout** with `fetch-depth: 0` and `ref: main` (the post-merge state).
2. **Setup** pnpm 10.18.3 and Node 20 with `registry-url: https://registry.npmjs.org/` (required for the npm OIDC flow in `actions/setup-node`).
3. **Parse PR title** from `github.event.pull_request.title`:

   | Pattern | Bump |
   |---|---|
   | `^fix(\(.+\))?: ` | `patch` |
   | `^feat(\(.+\))?: ` | `minor` |
   | `^feat(\(.+\))?!: ` *or* `BREAKING CHANGE:` in PR body | `major` |
   | Anything else | none — exit job successfully, no release |

4. **Bump** `package.json` only (no local commit/tag yet):
   ```bash
   pnpm version "$BUMP" --no-git-tag-version
   NEW=$(jq -r .version package.json)
   ```
   Reading the version back from `package.json` with `jq` is more robust than parsing `pnpm version`'s stdout (which prints the version with a `v` prefix and can include extra output depending on registry config).
5. **Install / test / build:** `pnpm install --frozen-lockfile && pnpm test && pnpm build`.
6. **Publish via OIDC:**
   ```bash
   pnpm publish --access public --provenance --no-git-checks
   ```
   No `NODE_AUTH_TOKEN` or `NPM_TOKEN` — the combination of `setup-node` with a `registry-url`, `id-token: write` permission, and the `npm-publish` environment makes npm accept the short-lived OIDC token.
7. **Commit version bump back to main:**
   ```bash
   git config user.name  "github-actions[bot]"
   git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
   git add package.json
   git commit -m "chore(release): v$NEW [skip ci]"
   ```
   The `[skip ci]` token in the commit message prevents any future `push: main` workflows from retriggering on this bot commit.
8. **Tag and push:**
   ```bash
   git tag -a "v$NEW" -m "v$NEW"
   git push origin main --follow-tags
   ```
9. **Create GitHub Release** with autogenerated notes:
   ```bash
   gh release create "v$NEW" --generate-notes --title "v$NEW"
   ```

### Behavior matrix

| PR title | Action |
|---|---|
| `fix(printify): retry 429s on bulk sync` | publish patch (e.g., `0.3.0` → `0.3.1`), tag, release |
| `feat: add variant pricing sync` | publish minor (e.g., `0.3.0` → `0.4.0`), tag, release |
| `feat!: rename printify_id option keys` | publish major (e.g., `0.3.0` → `1.0.0`), tag, release |
| `docs: clarify README setup` | merge, no release, nothing published |
| `chore(deps): bump axios` | merge, no release |
| `Fix typo in logger` (no prefix) | **PR check fails before merge**, asks for retitle |
| Two `fix:` PRs merged ~simultaneously | concurrency group serializes; second reads bumped `package.json` and bumps from there |
| Merged PR whose diff hand-edited `package.json#version` | **PR check fails before merge** (version-field-guard job) |

## Trusted Publisher (OIDC) configuration

This is a one-time setup, performed in the browser by the npm package maintainer:

1. Sign in to `npmjs.com` as the maintainer of `medusa-plugin-printify`.
2. Package page → **Settings** → **Trusted Publishers** → **GitHub Actions** → **Add**.
3. Enter:
   - Repository owner: `greedychipmunk`
   - Repository name: `medusa-plugin-printify`
   - Workflow filename: `release.yml`
   - Environment name: `npm-publish`
4. Save.

On the GitHub side, before the first `release.yml` run:

1. Repo → **Settings** → **Environments** → **New environment** → `npm-publish`.
2. Add a **Deployment branch rule**: `Selected branches and tags` → restrict to `main`.
3. (Optional) Add yourself as a required reviewer to add a human-in-the-loop gate before each publish. Default rollout: no required reviewer (solo workflow).

The OIDC token's `sub` claim includes the workflow filename, the repo, and the environment. npm validates all three against the Trusted Publisher configuration. A malicious workflow added to the repo (e.g., `.github/workflows/evil.yml`) cannot publish — its filename wouldn't match.

`--provenance` produces a signed attestation linking the published tarball to the exact workflow run and commit SHA. Surfaced as a "Provenance" badge on the package's npmjs.com page.

## Branch protection on `main`

Configured in the GitHub UI after the workflows have run successfully once:

- Require a pull request before merging.
- Require these status checks to pass: `test`, `pr-title-lint`, `version-field-guard`.
- Allow `github-actions[bot]` to bypass the "no direct push" rule — needed so `release.yml` can push the version-bump commit and tag to `main`. Configured in the "bypass list" on the branch protection rule.

The `pr-title-lint` check and human review are the real security boundary under this design: anything that merges to `main` will ship to npm.

## Package.json changes

In the same PR that adds the workflows:

- **Remove** `release:patch`, `release:minor`, `release:major` scripts. Under the new model, humans never run `pnpm version` locally — CI is the sole authority. Leaving these around invites the failure mode that motivated this design (forgotten/expired `NPM_TOKEN`, half-applied local state, manual race against CI).
- **Keep** `publish:npm` and `prepublishOnly`. `prepublishOnly` runs `medusa plugin:build` and is what `pnpm publish` invokes inside CI. `publish:npm` remains useful for emergency manual publishes if CI is down.

## Rollout sequence

Order matters — the steps below address a chicken-and-egg problem with branch protection and a leftover state from a prior failed manual release.

1. **Finish the in-flight `0.2.0` release manually.** Local state currently has a committed-and-tagged `0.2.0` that was never published (the npm token in `~/.npmrc` was expired). Refresh npm auth with `npm login`, then `pnpm publish --access public` and `git push --follow-tags` from the plugin directory. This clears the half-applied state before adopting the new model.
2. **Open the CI/CD PR** containing `ci.yml`, `release.yml`, `pull_request_template.md`, this spec, and the `package.json` script cleanup. PR title: `feat: github actions ci/cd with trusted publisher` — this triggers a `0.3.0` minor release once merged.
3. **Before merging:** complete the Trusted Publisher configuration on npmjs.com and create the `npm-publish` GitHub Environment (per the "Trusted Publisher configuration" section above).
4. **Merge.** `release.yml` runs: bumps to `0.3.0`, publishes via OIDC with provenance, tags `v0.3.0`, creates the GitHub Release.
5. **Verify:**
   - `npm view medusa-plugin-printify version` returns `0.3.0`.
   - Tag `v0.3.0` exists on origin.
   - GitHub Release page shows autogenerated notes.
   - npmjs.com package page shows a "Provenance" badge.
6. **Enable branch protection** on `main`, referencing the now-existing status checks (`test`, `pr-title-lint`, `version-field-guard`).

## Risks and edge cases

- **Solo-maintainer trust surface.** With branch protection allowing self-merge, the only thing standing between a typo and a published release is the `test` and `pr-title-lint` checks. This is acceptable for a single-maintainer plugin but should be revisited if collaborators are added (then: enable required reviewer on `npm-publish` environment).
- **Fork PRs cannot publish.** OIDC requires `id-token: write`, which GitHub denies for PRs from forks. This is intentional — fork PRs run `ci.yml` only. The release workflow runs on `pull_request: closed` from the base repo, post-merge, where token permissions are full. No change needed; just noting the behavior.
- **`npm view` rate limits and outages.** The release workflow uses `pnpm version` (which reads `package.json`, not the registry), so registry outages don't block the bump computation. The `publish` step itself will retry on transient registry failures; permanent failure (e.g., registry down for hours) requires re-running the workflow after the bump commit is already on `main` — the workflow needs to be idempotent enough that a re-run on the bumped state still publishes successfully. **Mitigation:** the bump-commit step happens *after* a successful publish, so a failed publish leaves no committed bump — re-running the workflow re-parses the original PR title and bumps from the unchanged `package.json`. (See "Failure recovery" below for full table.)
- **Two simultaneous merges of incompatible types** (e.g., `fix:` and `feat!:` within seconds). Concurrency group serializes, so the second one sees the first one's bump committed to `main` and computes its own bump from that state. Correctness preserved; the second release's version reflects both PRs' worth of changes.
- **PR retitled after merge.** The release workflow reads the PR title from the `pull_request: closed` event payload, which reflects the title *at close time*. Retitling after merge has no effect on the published version (already shipped). Acceptable.

### Failure recovery table

| Failure point in `release.yml` | Recovery |
|---|---|
| `pnpm test` fails | No publish, no bump committed. Fix on a follow-up PR. |
| `pnpm build` fails | Same — no publish, no bump committed. |
| `pnpm publish` fails (network, registry, OIDC) | No bump committed. Re-run the workflow from the GitHub UI; it re-parses the PR title and retries from scratch. |
| `pnpm publish` succeeded but `git push` failed | The bump commit lived only on the (now-gone) runner. Locally: `pnpm version <bump> --no-git-tag-version` to match what was published, commit as `chore(release): v$NEW [skip ci]`, `git tag -a v$NEW -m v$NEW`, `git push origin main --follow-tags`, then `gh release create v$NEW --generate-notes`. Rare — only happens if the GitHub API has an outage between publish and push. |
| `gh release create` failed but publish + push succeeded | Re-run just the release-creation step, or create the Release manually in the UI. The npm package is already correct. |

## Open questions for implementation

None remaining — all design decisions resolved during brainstorming:

- Release trigger: PR title (conventional-commit prefix), automatic bump.
- Auth: Trusted Publishers / OIDC, no long-lived token.
- PR-time checks: tests + build on Node 20.
- Post-publish artifacts: git tag + GitHub Release with autogenerated notes.
