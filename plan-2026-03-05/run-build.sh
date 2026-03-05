#!/bin/bash
set -euo pipefail

# ============================================================
# Frankenbeast RALPH Loop — Observer-Powered Build Runner
# ============================================================
# Thin wrapper that ensures the base branch exists, then hands
# off to the TypeScript build runner which handles everything:
#   - Ralph loops (impl + harden) per chunk
#   - Token tracking & cost calculation
#   - Budget enforcement (CircuitBreaker)
#   - Loop detection for stuck sessions
#   - SQLite trace persistence
#   - Live trace viewer at http://localhost:4040
#   - Checkpoint/resume across crashes
#   - Rate limit detection & auto-retry
#
# Usage:
#   ./plan-2026-03-05/run-build.sh                    # start or resume
#   ./plan-2026-03-05/run-build.sh --reset             # start fresh
#   ./plan-2026-03-05/run-build.sh --budget 5          # $5 budget limit
#   ./plan-2026-03-05/run-build.sh --no-viewer         # skip trace viewer
#   ./plan-2026-03-05/run-build.sh --verbose           # debug-level logs
#
# Prerequisites:
#   - claude CLI installed and authenticated (codex optional for fallback)
#   - Node.js 20+ with npx
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="${SCRIPT_DIR}/build-runner.ts"
BASE_BRANCH="feat/close-execution-gap"

# Ensure base branch exists
git checkout -b "$BASE_BRANCH" 2>/dev/null || git checkout "$BASE_BRANCH"

# Verify runner exists
if [ ! -f "$RUNNER" ]; then
  echo "Error: build-runner.ts not found at $RUNNER"
  exit 1
fi

exec npx tsx "$RUNNER" --base-branch "$BASE_BRANCH" "$@"
