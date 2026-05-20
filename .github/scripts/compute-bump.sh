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
