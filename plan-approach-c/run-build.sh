#!/bin/bash
set -euo pipefail

# ── Resolve paths ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNNER="$SCRIPT_DIR/build-runner.ts"

# ── Base branch (edit this per plan) ──
BASE_BRANCH="feat/approach-c-pipeline"

# ── Validate ──
if [[ ! -f "$RUNNER" ]]; then
  echo "Error: build-runner.ts not found at $RUNNER"
  exit 1
fi

# ── Run ──
cd "$REPO_ROOT"
exec npx tsx "$RUNNER" --plan-dir "$SCRIPT_DIR" --base-branch "$BASE_BRANCH" "$@"
