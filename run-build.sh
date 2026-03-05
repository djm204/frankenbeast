#!/bin/bash
# run-build.sh — Autonomous RALPH-loop execution for executeTask workflow
# Generated from design doc: docs/plans/2026-03-05-execute-task-workflow-design.md
#
# Each chunk gets an Implementation Loop + Hardening Loop.
# Atomic feature branches per chunk. Context resets between loops.

set -euo pipefail

PLAN_DIR="./plan-2026-03-05"
BASE_BRANCH="feat/execute-task-workflow"

# Ensure we're on the right base branch
git checkout -b "$BASE_BRANCH" 2>/dev/null || git checkout "$BASE_BRANCH"

FILES=("$PLAN_DIR"/*.md)

echo "=========================================="
echo "  ExecuteTask Workflow — RALPH Build"
echo "  ${#FILES[@]} chunks to process"
echo "=========================================="

for i in "${!FILES[@]}"; do
  FILE="${FILES[$i]}"
  CHUNK_ID=$(basename "$FILE" .md)
  BRANCH="feat/${CHUNK_ID}"
  STEP=$((i + 1))

  echo ""
  echo "=========================================="
  echo "  Phase ${STEP}/${#FILES[@]}: ${CHUNK_ID}"
  echo "=========================================="

  # Create feature branch for this chunk
  git checkout "$BASE_BRANCH"
  git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"

  # ── 1. Implementation Loop ──────────────────────────────────────
  echo ""
  echo ">>> Starting Implementation Loop: ${CHUNK_ID}"
  echo ""

  claude --print \
    "Read ${FILE}. Implement ALL features described. Use TDD: write failing tests first, then implement to make them pass, then commit. Make atomic commits for each test-implementation pair. Follow the exact file paths and code in the plan. Run the verification command and ensure it passes. Output <promise>IMPL_${CHUNK_ID}_DONE</promise> when the verification command passes and all work is committed." \
    --max-turns 30

  echo ""
  echo ">>> Implementation complete: ${CHUNK_ID}"

  # ── 2. Hardening Loop ───────────────────────────────────────────
  echo ""
  echo ">>> Starting Hardening Loop: ${CHUNK_ID}"
  echo ""

  claude --print \
    "You are reviewing the work done on branch '${BRANCH}' for chunk '${FILE}'.

Review checklist:
1. Read the chunk file at ${FILE} — verify ALL success criteria are met
2. Run the verification command from the chunk file — it must pass
3. Check for: missing edge cases, uncaught errors, type safety gaps, test coverage holes
4. Review the hardening requirements section — every item must be satisfied
5. If any issues found: fix them, write a test for the fix, commit
6. Run the FULL test suite: cd franken-orchestrator && npx vitest run
7. Verify TypeScript compiles: cd franken-orchestrator && npx tsc --noEmit

Output <promise>HARDEN_${CHUNK_ID}_DONE</promise> when all checks pass and everything is committed." \
    --max-turns 15

  echo ""
  echo ">>> Hardening complete: ${CHUNK_ID}"

  # ── 3. Merge back to base branch ───────────────────────────────
  git checkout "$BASE_BRANCH"
  git merge "$BRANCH" --no-edit
  echo ">>> Merged ${BRANCH} into ${BASE_BRANCH}"

  echo ""
  echo ">>> ${CHUNK_ID} is fully hardened and committed."
  echo "=========================================="
done

echo ""
echo "=========================================="
echo "  All ${#FILES[@]} phases complete."
echo "  Branch: ${BASE_BRANCH}"
echo "=========================================="
echo ""
echo "Final verification:"
cd franken-orchestrator && npx vitest run && npx tsc --noEmit
echo ""
echo ">>> ExecuteTask workflow is production-ready."
