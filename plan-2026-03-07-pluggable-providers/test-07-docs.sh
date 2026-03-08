#!/usr/bin/env bash
# Test script for chunk 07: ADR-010 + ARCHITECTURE.md + RAMP_UP.md
# Each check prints PASS/FAIL and exits non-zero on any failure.
set -euo pipefail

FAILS=0
DOCS_DIR="/home/pfk/dev/frankenbeast/docs"

pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; FAILS=$((FAILS + 1)); }

echo "=== Chunk 07 Doc Tests ==="

# --- ADR-010 ---
echo ""
echo "--- ADR-010 ---"

ADR="$DOCS_DIR/adr/010-pluggable-cli-providers.md"

# 1. ADR-010 exists
if [[ -f "$ADR" ]]; then pass "ADR-010 file exists"; else fail "ADR-010 file missing"; fi

# 2. Status: Accepted
if grep -q "^Accepted" "$ADR"; then pass "Status: Accepted"; else fail "Status not Accepted"; fi

# 3. Documents replacing hardcoded union with ICliProvider + ProviderRegistry
if grep -q "ICliProvider" "$ADR" && grep -q "ProviderRegistry" "$ADR"; then
  pass "Documents ICliProvider + ProviderRegistry"
else
  fail "Missing ICliProvider or ProviderRegistry mention"
fi

# 4. Consequence: single-file provider addition
if grep -qi "single.file" "$ADR"; then pass "Consequence: single-file provider addition"; else fail "Missing single-file provider consequence"; fi

# 5. Consequence: provider-agnostic MartinLoop/CliLlmAdapter
if grep -q "MartinLoop" "$ADR" && grep -q "CliLlmAdapter" "$ADR"; then
  pass "Consequence: provider-agnostic MartinLoop/CliLlmAdapter"
else
  fail "Missing provider-agnostic MartinLoop or CliLlmAdapter"
fi

# 6. Consequence: config file overrides
if grep -qi "config.*overrides\|overrides.*config" "$ADR"; then
  pass "Consequence: config file overrides"
else
  fail "Missing config file overrides consequence"
fi

# 7. Consequence: Warp deferred
if grep -qi "warp.*deferred\|warp.*terminal host" "$ADR"; then
  pass "Consequence: Warp deferred"
else
  fail "Missing Warp deferred consequence"
fi

# --- ARCHITECTURE.md ---
echo ""
echo "--- ARCHITECTURE.md ---"

ARCH="$DOCS_DIR/ARCHITECTURE.md"

# 8. Provider registry in Orchestrator Internals component table
if grep -q "ProviderRegistry" "$ARCH"; then
  pass "ProviderRegistry in ARCHITECTURE.md"
else
  fail "ProviderRegistry missing from ARCHITECTURE.md"
fi

# 9. Provider directory listed
if grep -q "providers/" "$ARCH"; then
  pass "providers/ directory listed"
else
  fail "providers/ directory missing from ARCHITECTURE.md"
fi

# 10. Shows MartinLoop consuming registry
if grep -q "MartinLoop" "$ARCH"; then
  pass "MartinLoop in ARCHITECTURE.md"
else
  fail "MartinLoop missing from ARCHITECTURE.md"
fi

# 11. Shows CliLlmAdapter consuming registry/provider
if grep -q "CliLlmAdapter" "$ARCH"; then
  pass "CliLlmAdapter in ARCHITECTURE.md"
else
  fail "CliLlmAdapter missing from ARCHITECTURE.md"
fi

# 12. Mentions --provider flag
if grep -q "\-\-provider" "$ARCH"; then
  pass "--provider flag mentioned"
else
  fail "--provider flag missing from ARCHITECTURE.md"
fi

# 13. Mentions --providers flag
if grep -q "\-\-providers" "$ARCH"; then
  pass "--providers flag mentioned"
else
  fail "--providers flag missing from ARCHITECTURE.md"
fi

# 14. Mentions config providers section
if grep -qi "config.*providers\|providers.*section\|providers.*config" "$ARCH"; then
  pass "Config providers section mentioned"
else
  fail "Config providers section missing from ARCHITECTURE.md"
fi

# 15. References ADR-010
if grep -q "ADR-010\|010-pluggable-cli-providers" "$ARCH"; then
  pass "ADR-010 referenced in ARCHITECTURE.md"
else
  fail "ADR-010 not referenced in ARCHITECTURE.md"
fi

# --- RAMP_UP.md ---
echo ""
echo "--- RAMP_UP.md ---"

RAMP="$DOCS_DIR/RAMP_UP.md"

# 16. Orchestrator tree includes providers/ directory
if grep -q "providers/" "$RAMP"; then
  pass "providers/ directory in orchestrator tree"
else
  fail "providers/ directory missing from RAMP_UP.md orchestrator tree"
fi

# 17. Mentions all 4 providers (claude, codex, gemini, aider)
ALL_4=true
for p in claude codex gemini aider; do
  if ! grep -qi "$p" "$RAMP" 2>/dev/null; then
    ALL_4=false
    fail "Provider '$p' not mentioned in RAMP_UP.md"
  fi
done
if $ALL_4; then pass "All 4 providers mentioned in RAMP_UP.md"; fi

# 18. Mentions registry pattern
if grep -q "ProviderRegistry\|registry" "$RAMP"; then
  pass "Registry pattern mentioned in RAMP_UP.md"
else
  fail "Registry pattern missing from RAMP_UP.md"
fi

# 19. RAMP_UP.md stays under 5000 tokens (~3750 words is roughly 5000 tokens)
WORD_COUNT=$(wc -w < "$RAMP")
if [[ $WORD_COUNT -le 3750 ]]; then
  pass "RAMP_UP.md word count ($WORD_COUNT) within 5000-token limit"
else
  fail "RAMP_UP.md word count ($WORD_COUNT) may exceed 5000-token limit"
fi

# --- Cross-cutting ---
echo ""
echo "--- Cross-cutting ---"

# 20. No docs describe current architecture with hardcoded 'claude' | 'codex' union type
# (ADR context section describing the OLD state is acceptable)
# Check ARCHITECTURE.md and RAMP_UP.md specifically (not the ADR context)
if grep -q "'claude' | 'codex'" "$ARCH" || grep -q "'claude' | 'codex'" "$RAMP"; then
  fail "Found hardcoded 'claude' | 'codex' union type reference in ARCHITECTURE.md or RAMP_UP.md"
else
  pass "No hardcoded 'claude' | 'codex' references in active docs"
fi

# 21. ADR format matches existing ADRs (has ## Status, ## Context, ## Decision, ## Consequences)
for section in "## Status" "## Context" "## Decision" "## Consequences"; do
  if ! grep -q "$section" "$ADR"; then
    fail "ADR-010 missing section: $section"
  fi
done
pass "ADR-010 has standard ADR sections"

# 22. No aspirational wording in ADR (check for words like "will", "planned", "future" in Decision section)
# Extract Decision section and check
DECISION_SECTION=$(sed -n '/^## Decision/,/^## /p' "$ADR" | head -n -1)
if echo "$DECISION_SECTION" | grep -qi "will be\|planned\|in the future\|upcoming"; then
  fail "ADR-010 Decision section contains aspirational wording"
else
  pass "ADR-010 Decision section uses factual present tense"
fi

echo ""
echo "=== Results ==="
if [[ $FAILS -eq 0 ]]; then
  echo "ALL TESTS PASSED"
  exit 0
else
  echo "$FAILS TEST(S) FAILED"
  exit 1
fi
