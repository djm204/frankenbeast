# Chunk 04: No-Op Design Doc Detector

## Objective

Create `isNoOpDesign()` to detect when an LLM-generated design doc signals "no work to do" (e.g., "code complete", "no changes required"). This enables the context-aware approval gate in chunk 05 — if the design is a no-op, the user gets a different prompt.

Independent of chunks 01-03.

## Files

- **Create**: `franken-orchestrator/src/cli/noop-detector.ts`
- **Test**: `franken-orchestrator/tests/unit/cli/noop-detector.test.ts`

## Success Criteria

- [ ] `isNoOpDesign(markdown)` returns `true` for docs with no-op keywords ("code complete", "no changes required", "fully implemented", "nothing to do", "no work needed", "no implementation needed")
- [ ] Returns `true` for very short docs (< 200 chars, no work sections)
- [ ] Returns `false` if doc has `## Implementation`, `## Tasks`, `## Changes`, `## Components to Build`, or `## Steps` sections
- [ ] Returns `false` for real design docs with actionable content
- [ ] Work section check takes priority over keyword/length checks
- [ ] All 11 tests pass
- [ ] `npx tsc --noEmit` passes in `franken-orchestrator/`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/cli/noop-detector.test.ts
```

## Implementation Reference

**Test file** (`tests/unit/cli/noop-detector.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import { isNoOpDesign } from '../../src/cli/noop-detector.js';

describe('isNoOpDesign', () => {
  it('detects "code complete" as no-op', () => {
    expect(isNoOpDesign('The module is code complete. All features implemented.')).toBe(true);
  });

  it('detects "no changes required" as no-op', () => {
    expect(isNoOpDesign('After analysis, no changes required.')).toBe(true);
  });

  it('detects "fully implemented" as no-op', () => {
    expect(isNoOpDesign('The observer is fully implemented with all features.')).toBe(true);
  });

  it('detects "nothing to do" as no-op', () => {
    expect(isNoOpDesign('There is nothing to do here.')).toBe(true);
  });

  it('detects "no work needed" as no-op', () => {
    expect(isNoOpDesign('Analysis shows no work needed.')).toBe(true);
  });

  it('detects "no implementation needed" as no-op', () => {
    expect(isNoOpDesign('This is complete. No implementation needed.')).toBe(true);
  });

  it('detects very short docs as no-op', () => {
    expect(isNoOpDesign('Done.')).toBe(true);
  });

  it('returns false for real design docs', () => {
    const realDoc = `# Auth System Design

## Problem
Need authentication.

## Implementation
Add JWT tokens and refresh flow.

## Tasks
1. Create auth middleware
2. Add login endpoint`;
    expect(isNoOpDesign(realDoc)).toBe(false);
  });

  it('returns false for docs with ## Implementation section', () => {
    expect(isNoOpDesign('# Design\n\n## Implementation\nDo stuff.')).toBe(false);
  });

  it('returns false for docs with ## Tasks section', () => {
    expect(isNoOpDesign('# Design\n\n## Tasks\n1. Build it.')).toBe(false);
  });

  it('returns false for docs with ## Changes section', () => {
    expect(isNoOpDesign('# Design\n\n## Changes\nModify auth module.')).toBe(false);
  });
});
```

**Implementation** (`src/cli/noop-detector.ts`):

```typescript
const NOOP_KEYWORDS = [
  'code complete',
  'no changes required',
  'no changes needed',
  'fully implemented',
  'nothing to do',
  'no work needed',
  'no work required',
  'no implementation needed',
  'no implementation required',
  'already complete',
  'already implemented',
];

const WORK_SECTIONS = [
  /^## Implementation/m,
  /^## Tasks/m,
  /^## Changes/m,
  /^## Components to Build/m,
  /^## Steps/m,
];

const MIN_CONTENT_LENGTH = 200;

export function isNoOpDesign(markdown: string): boolean {
  const lower = markdown.toLowerCase();

  // If the doc has implementation/tasks sections, it's real work
  for (const pattern of WORK_SECTIONS) {
    if (pattern.test(markdown)) return false;
  }

  // Very short docs are likely "nothing to do" responses
  if (markdown.trim().length < MIN_CONTENT_LENGTH) return true;

  // Check for no-op keywords
  return NOOP_KEYWORDS.some(kw => lower.includes(kw));
}
```

## Hardening Requirements

- Work section patterns use `/m` flag (multiline) — must match at start of a line
- Work section check MUST come before keyword/length checks (a doc can say "fully implemented" in a Problem section and still have real Tasks)
- Do NOT use complex NLP or LLM calls — simple keyword matching is sufficient and deterministic
- Keep `MIN_CONTENT_LENGTH` at 200 chars — short enough to catch stub responses, long enough to avoid false positives on terse but real designs
- `isNoOpDesign` is a pure function — no side effects, no I/O
