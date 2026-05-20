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

# Tighter spec: only a literal space is accepted after the colon (no tab, no CR)
assert_bump "fix:<TAB> -> empty"           $'fix:\ttyped with tab'            ""  ""
assert_bump "feat:<TAB> -> empty"          $'feat:\ttyped with tab'           ""  ""
assert_bump "fix!:<TAB> -> empty"          $'fix!:\ttyped with tab'           ""  ""

echo
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
