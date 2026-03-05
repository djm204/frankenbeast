#!/bin/bash
set -euo pipefail

# ============================================================
# Frankenbeast RALPH Loop — Observer-Powered Build Runner
# ============================================================
# Two-stage build:
#   Stage 1: Bootstrap — builds the TypeScript runner (chunk 00)
#   Stage 2: Execute  — runner processes chunks 01-12 with
#            @frankenbeast/observer as "context police"
#
# The runner provides:
#   - Token tracking & cost calculation per chunk
#   - Budget enforcement (CircuitBreaker)
#   - Loop detection for stuck sessions
#   - SQLite trace persistence
#   - Live trace viewer at http://localhost:4040
#   - Checkpoint/resume across crashes
#   - Auto-retry on context exhaustion
#
# Usage:
#   ./plan-2026-03-05/run-build.sh                    # start or resume
#   ./plan-2026-03-05/run-build.sh --reset             # start fresh
#   ./plan-2026-03-05/run-build.sh --budget 5          # $5 budget limit
#   ./plan-2026-03-05/run-build.sh --no-viewer         # skip trace viewer
#
# Prerequisites:
#   - claude CLI installed and authenticated
#   - Node.js 20+ with npx
#   - Git repo clean (no uncommitted changes)
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAN_DIR="$SCRIPT_DIR"
RUNNER="${PLAN_DIR}/build-runner.ts"
CHECKPOINT_FILE="${PLAN_DIR}/.checkpoint"
LOG_FILE="${PLAN_DIR}/build.log"
BASE_BRANCH="feat/close-execution-gap"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo -e "$msg"
  echo -e "$msg" >> "$LOG_FILE"
}

# ── Rate limit detection helper ──
# Checks if output contains rate limit indicators. Returns 0 if rate limited.
is_rate_limited() {
  local output_file="$1"
  grep -qiE '(rate.?limit|429|too many requests|overloaded|retry.?after)' "$output_file" 2>/dev/null
}

# Parses rate limit reset time from error output. Prints seconds to wait.
parse_rate_limit_reset() {
  local output_file="$1"
  local reset_seconds=60  # default fallback

  # Look for "Retry-After: <N>" or "retry after <N> seconds"
  local parsed
  parsed=$(grep -oiE 'retry.?after:?\s*([0-9]+)' "$output_file" | grep -oE '[0-9]+' | head -1)
  if [ -n "$parsed" ]; then
    reset_seconds="$parsed"
  fi

  # Look for "try again in <N> minutes"
  local parsed_min
  parsed_min=$(grep -oiE 'try again in ([0-9]+) minute' "$output_file" | grep -oE '[0-9]+' | head -1)
  if [ -n "$parsed_min" ]; then
    reset_seconds=$((parsed_min * 60))
  fi

  echo "$reset_seconds"
}

# Sleeps until rate limit reset + 3 minute buffer
sleep_for_rate_limit() {
  local reset_seconds="$1"
  local sleep_seconds=$((reset_seconds + 180))
  local resume_time
  resume_time=$(date -d "+${sleep_seconds} seconds" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -v+${sleep_seconds}S '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "~${sleep_seconds}s from now")

  log "${YELLOW}[rate-limit] Rate limited. Reset in ${reset_seconds}s. Sleeping until ${resume_time} (reset + 3min buffer)...${NC}"
  sleep "$sleep_seconds"
  log "${GREEN}[rate-limit] Cooldown complete. Resuming...${NC}"
}

# ── Ralph Loop ──
# Runs the same prompt repeatedly until a <promise>TAG</promise> is detected
# in stdout, or max iterations reached. Handles rate limits transparently.
#
# Usage: run_ralph_loop <prompt> <promise_tag> <max_iterations> <max_turns>
# Returns: 0 if promise detected, 1 if max iterations without promise
run_ralph_loop() {
  local prompt="$1"
  local promise_tag="$2"
  local max_iterations="${3:-10}"
  local max_turns="${4:-30}"
  local iteration=0
  local stdout_file
  local stderr_file

  while [ $iteration -lt $max_iterations ]; do
    iteration=$((iteration + 1))
    log "${YELLOW}[ralph] Iteration ${iteration}/${max_iterations}...${NC}"

    stdout_file=$(mktemp)
    stderr_file=$(mktemp)

    # Run Claude — capture stdout for promise detection, stderr for rate limits
    local exit_code=0
    claude --print "$prompt" --max-turns "$max_turns" \
      > >(tee "$stdout_file" | tee -a "$LOG_FILE") \
      2> >(tee "$stderr_file" >&2) \
      || exit_code=$?

    # Check for promise in stdout
    if grep -q "<promise>${promise_tag}</promise>" "$stdout_file" 2>/dev/null; then
      log "${GREEN}[ralph] Promise detected: ${promise_tag}${NC}"
      rm -f "$stdout_file" "$stderr_file"
      return 0
    fi

    # Check for rate limit
    if [ $exit_code -ne 0 ] && is_rate_limited "$stderr_file"; then
      local reset_seconds
      reset_seconds=$(parse_rate_limit_reset "$stderr_file")
      sleep_for_rate_limit "$reset_seconds"
      # Don't count rate-limited iterations
      iteration=$((iteration - 1))
      rm -f "$stdout_file" "$stderr_file"
      continue
    fi

    # No promise, no rate limit — Claude finished but didn't complete
    if [ $exit_code -eq 0 ]; then
      log "${YELLOW}[ralph] Iteration ${iteration} finished without promise. Claude will see its commits next iteration.${NC}"
    else
      log "${YELLOW}[ralph] Iteration ${iteration} exited with code ${exit_code}. Retrying with fresh context...${NC}"
    fi

    rm -f "$stdout_file" "$stderr_file"
  done

  log "${RED}[ralph] Max iterations (${max_iterations}) reached without promise: ${promise_tag}${NC}"
  return 1
}

# ── Handle --reset ──
if [ "${1:-}" = "--reset" ]; then
  rm -f "$CHECKPOINT_FILE" "$RUNNER" "${PLAN_DIR}/build-traces.db"
  echo "" > "$LOG_FILE"
  log "${YELLOW}Reset: cleared checkpoint, runner, traces, and log${NC}"
  shift
fi

touch "$LOG_FILE"

# ── Ensure base branch ──
git checkout -b "$BASE_BRANCH" 2>/dev/null || git checkout "$BASE_BRANCH"

# ============================================================
# Stage 1: Bootstrap — Build the TypeScript runner (chunk 00)
# ============================================================

is_bootstrapped() {
  [ -f "$RUNNER" ] && grep -q "TraceContext" "$RUNNER" 2>/dev/null
}

if is_bootstrapped; then
  log "${CYAN}[bootstrap] build-runner.ts exists, skipping chunk 00${NC}"
else
  log "${GREEN}[bootstrap] Stage 1: Building the observer-powered runner...${NC}"

  CHUNK_00="${PLAN_DIR}/00_build_runner.md"
  BRANCH_00="feat/00_build_runner"

  if [ ! -f "$CHUNK_00" ]; then
    log "${RED}[bootstrap] Chunk 00 not found: $CHUNK_00${NC}"
    exit 1
  fi

  git checkout "$BASE_BRANCH"
  git checkout -b "$BRANCH_00" 2>/dev/null || git checkout "$BRANCH_00"

  # Implementation Ralph Loop
  log "${YELLOW}[bootstrap] Implementation Ralph loop starting...${NC}"

  IMPL_PROMPT="Read ${CHUNK_00}. Implement the TypeScript build runner described. Create the file at ${RUNNER}. Commit when done. Output <promise>IMPL_00_build_runner_DONE</promise> when complete."

  if run_ralph_loop "$IMPL_PROMPT" "IMPL_00_build_runner_DONE" 10 25; then
    log "${GREEN}[bootstrap] build-runner.ts created${NC}"
  else
    log "${RED}[bootstrap] Failed to create build-runner.ts after max iterations${NC}"
    exit 1
  fi

  # Hardening Ralph Loop
  log "${YELLOW}[bootstrap] Hardening Ralph loop starting...${NC}"

  HARDEN_PROMPT="Review ${CHUNK_00} and the work on branch '${BRANCH_00}'. Check all success criteria. Fix issues. Verify: npx tsx ${RUNNER} --help. Commit fixes. Output <promise>HARDEN_00_build_runner_DONE</promise> when stable."

  if run_ralph_loop "$HARDEN_PROMPT" "HARDEN_00_build_runner_DONE" 5 10; then
    log "${GREEN}[bootstrap] Runner hardened${NC}"
  else
    log "${YELLOW}[bootstrap] Hardening didn't complete promise, continuing anyway${NC}"
  fi

  # Merge back
  git checkout "$BASE_BRANCH"
  if git merge "$BRANCH_00" --no-edit; then
    log "${GREEN}[bootstrap] Merged chunk 00 to $BASE_BRANCH${NC}"
  else
    log "${RED}[bootstrap] Merge conflict on chunk 00${NC}"
    git merge --abort
    exit 1
  fi

  if ! is_bootstrapped; then
    log "${RED}[bootstrap] build-runner.ts still missing after chunk 00. Aborting.${NC}"
    exit 1
  fi
fi

# ============================================================
# Stage 2: Execute chunks 01-12 via the TypeScript runner
# ============================================================

log "${GREEN}[stage-2] Handing off to observer-powered runner...${NC}"
log "${GREEN}[stage-2] Trace viewer will be at http://localhost:4040${NC}"

exec npx tsx "$RUNNER" "$@"
