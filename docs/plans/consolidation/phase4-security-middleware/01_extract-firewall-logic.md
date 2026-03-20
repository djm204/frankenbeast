# Chunk 4.1: Extract Firewall Logic from Git History

**Phase:** 4 — Security Middleware
**Depends on:** Phase 1 (frankenfirewall deleted)
**Estimated size:** Small (research + documentation, no code)

---

## Purpose

Before implementing the new middleware, review the deleted `frankenfirewall` package from git history to extract the useful validation patterns. This prevents losing proven logic during the rewrite.

## What to Do

### 1. Retrieve firewall source from git

```bash
git show v0.pre-consolidation:packages/frankenfirewall/src/ > /tmp/firewall-source.txt
```

Or browse the pre-consolidation tag:
```bash
git log v0.pre-consolidation -- packages/frankenfirewall/
git show v0.pre-consolidation:packages/frankenfirewall/src/
```

### 2. Catalog the existing patterns

Document what the firewall implemented:

**Injection detection patterns:**
- What regex patterns or heuristics does it use?
- What prompt injection signatures does it detect?
- Any false positive mitigations?

**PII masking rules:**
- What PII types does it detect? (email, phone, SSN, credit card, etc.)
- What masking strategy? (redaction, replacement, hashing)
- Is it pre-LLM only, or also post-LLM?

**Output validation:**
- What response structure validation exists?
- Any content filtering?
- Any length/format checks?

### 3. Catalog existing tests

```bash
git show v0.pre-consolidation:packages/frankenfirewall/tests/
```

Document what each test verifies. These become the test requirements for the new middleware.

### 4. Write a summary document

Create a brief summary (not a separate doc — include in the commit message or as comments in the new middleware files) of:
- Patterns worth keeping
- Patterns that were overly aggressive or caused false positives
- Test cases to replicate

## Files

- No files created or modified — this is a research chunk
- Output: knowledge that informs Chunks 4.2 and 4.3

## Exit Criteria

- Reviewed all firewall source from git history
- Documented injection patterns, PII rules, and output validation logic
- Cataloged existing test cases
- Ready to implement middleware in Chunk 4.2
