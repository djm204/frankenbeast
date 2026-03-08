#!/bin/bash
set -euo pipefail

# ── Frankenbeast Pluggable CLI Providers Marathon Runner ──
#
# Usage:
#   ./run-build.sh                           # defaults: main branch, claude provider
#   ./run-build.sh --base-branch main        # explicit base branch
#   ./run-build.sh --provider codex          # use codex as primary
#   ./run-build.sh --budget 20 --verbose     # budget + debug logging
#   ./run-build.sh --reset                   # clear checkpoint, start fresh
#   ./run-build.sh --no-pr                   # skip PR creation
#
# The build-runner.ts handles:
#   - Feature-level branching (8 chunks, each gets its own branch)
#   - Provider fallback (claude -> codex on rate limit)
#   - Rate limit sleep (waits for reset if both providers hit limits)
#   - Checkpoint recovery (resume from last completed chunk)
#   - Clean CLI output (service badges, no garbled JSON)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Frankenbeast Pluggable CLI Providers Marathon        ║"
echo "║  Plan: plan-2026-03-07-pluggable-providers/           ║"
echo "║  Chunks: 8                                           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Ensure tsx is available
if ! command -v npx &> /dev/null; then
  echo "ERROR: npx not found. Install Node.js first."
  exit 1
fi

# Ensure we're in a git repo
if ! git rev-parse --is-inside-work-tree &> /dev/null; then
  echo "ERROR: Not inside a git repo."
  exit 1
fi

# Ensure working directory is clean
if [[ -n "$(git status --porcelain)" ]]; then
  echo "WARNING: Working directory has uncommitted changes."
  echo "  Commit or stash them before running the marathon."
  echo ""
  read -p "  Continue anyway? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Run the build runner with all passed args
exec npx tsx "$SCRIPT_DIR/build-runner.ts" --plan-dir "$SCRIPT_DIR" "$@"
