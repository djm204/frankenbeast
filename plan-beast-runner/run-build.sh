#!/bin/bash
set -euo pipefail

# ============================================================
# Beast Runner — RALPH Loop Build Script (Observer-Powered)
# ============================================================
# Thin wrapper that reuses the observer-powered TypeScript build
# runner from plan-2026-03-05/ with our plan dir and base branch.
#
# Observer features inherited:
#   - TraceContext spans per iteration
#   - TokenCounter + CostCalculator per chunk
#   - CircuitBreaker for budget enforcement
#   - LoopDetector for stuck sessions
#   - SQLiteAdapter for trace persistence
#   - TraceServer for live viewer at http://localhost:4040
#   - Checkpoint/resume across crashes
#   - Rate limit detection & provider fallback
#
# Usage:
#   ./plan-beast-runner/run-build.sh                    # start or resume
#   ./plan-beast-runner/run-build.sh --reset             # start fresh
#   ./plan-beast-runner/run-build.sh --budget 5          # $5 budget limit
#   ./plan-beast-runner/run-build.sh --no-viewer         # skip trace viewer
#   ./plan-beast-runner/run-build.sh --verbose           # debug-level logs
#
# Prerequisites:
#   - claude CLI installed and authenticated (codex optional for fallback)
#   - Node.js 20+ with npx
#   - franken-observer built (npm run build in franken-observer/)
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNNER="${REPO_ROOT}/plan-2026-03-05/build-runner.ts"
BASE_BRANCH="feat/beast-runner"

# Ensure base branch exists
git checkout -b "$BASE_BRANCH" 2>/dev/null || git checkout "$BASE_BRANCH"

# Verify runner exists
if [ ! -f "$RUNNER" ]; then
  echo "Error: build-runner.ts not found at $RUNNER"
  echo "This script reuses the observer-powered build runner from plan-2026-03-05/"
  exit 1
fi

exec npx tsx "$RUNNER" --plan-dir "$SCRIPT_DIR" --base-branch "$BASE_BRANCH" "$@"
