# Chunk 03: Design Doc Summary Extractor

## Objective

Create `extractDesignSummary()` and `formatDesignCard()` utilities to replace the raw design doc dump with a concise summary card. When a design doc is generated, the user sees a compact card (title, section count, path, blurb) instead of hundreds of lines of markdown.

Independent of chunks 01-02.

## Files

- **Create**: `franken-orchestrator/src/cli/design-summary.ts`
- **Test**: `franken-orchestrator/tests/unit/cli/design-summary.test.ts`

## Success Criteria

- [ ] `extractDesignSummary(markdown)` returns `{ title, sectionCount, blurb }`
- [ ] Title extracted from first `# ` heading; defaults to `'Untitled'`
- [ ] `sectionCount` counts `## ` headings
- [ ] Blurb is first non-heading, non-list paragraph; truncated to 200 chars + `"..."`
- [ ] Handles empty doc gracefully (title=`'Untitled'`, sectionCount=0, blurb=`''`)
- [ ] `formatDesignCard()` outputs ANSI-formatted card with title, sections, path, blurb
- [ ] Card uses `ANSI` constants from existing `beast-logger.ts` (no new color deps)
- [ ] All 7 tests pass
- [ ] `npx tsc --noEmit` passes in `franken-orchestrator/`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/cli/design-summary.test.ts
```

## Implementation Reference

**Test file** (`tests/unit/cli/design-summary.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import { extractDesignSummary, formatDesignCard } from '../../src/cli/design-summary.js';

const sampleDoc = `# Observer Module Completeness

## Problem
The observer needs validation.

## Goal
Verify all observer features are implemented.

## Architecture
JWT-based tracing with spans.

## Components
- SpanTracer
- BudgetEnforcer
`;

describe('extractDesignSummary', () => {
  it('extracts title from first # heading', () => {
    const summary = extractDesignSummary(sampleDoc);
    expect(summary.title).toBe('Observer Module Completeness');
  });

  it('counts ## section headings', () => {
    const summary = extractDesignSummary(sampleDoc);
    expect(summary.sectionCount).toBe(4);
  });

  it('extracts first non-heading paragraph as blurb', () => {
    const summary = extractDesignSummary(sampleDoc);
    expect(summary.blurb).toContain('observer needs validation');
  });

  it('truncates blurb to ~200 chars', () => {
    const longDoc = `# Title\n\n${'A'.repeat(500)}`;
    const summary = extractDesignSummary(longDoc);
    expect(summary.blurb.length).toBeLessThanOrEqual(203);
  });

  it('handles doc with no headings', () => {
    const summary = extractDesignSummary('Just some text here.');
    expect(summary.title).toBe('Untitled');
    expect(summary.sectionCount).toBe(0);
    expect(summary.blurb).toContain('Just some text');
  });

  it('handles empty doc', () => {
    const summary = extractDesignSummary('');
    expect(summary.title).toBe('Untitled');
    expect(summary.sectionCount).toBe(0);
    expect(summary.blurb).toBe('');
  });
});

describe('formatDesignCard', () => {
  it('formats a card with title, section count, path, and blurb', () => {
    const card = formatDesignCard({
      title: 'Observer Module',
      sectionCount: 4,
      blurb: 'The observer needs validation.',
      filePath: '.frankenbeast/plans/design.md',
    });
    expect(card).toContain('Observer Module');
    expect(card).toContain('4');
    expect(card).toContain('.frankenbeast/plans/design.md');
    expect(card).toContain('observer needs validation');
  });
});
```

**Implementation** (`src/cli/design-summary.ts`):

```typescript
import { ANSI } from '../logging/beast-logger.js';

export interface DesignSummary {
  title: string;
  sectionCount: number;
  blurb: string;
}

export function extractDesignSummary(markdown: string): DesignSummary {
  const lines = markdown.split('\n');
  const titleLine = lines.find(l => /^# /.test(l));
  const title = titleLine ? titleLine.replace(/^# /, '').trim() : 'Untitled';
  const sectionCount = lines.filter(l => /^## /.test(l)).length;

  let blurb = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('-') || trimmed.startsWith('*')) continue;
    blurb = trimmed;
    break;
  }
  if (blurb.length > 200) {
    blurb = blurb.slice(0, 200) + '...';
  }

  return { title, sectionCount, blurb };
}

export function formatDesignCard(opts: {
  title: string;
  sectionCount: number;
  blurb: string;
  filePath: string;
}): string {
  const A = ANSI;
  const line = `${A.cyan}${'─'.repeat(50)}${A.reset}`;
  const parts = [
    `\n${line}`,
    `${A.cyan}│${A.reset} ${A.bold}Design Document${A.reset}`,
    `${line}`,
    `  ${A.dim}Title:${A.reset}    ${opts.title}`,
    `  ${A.dim}Sections:${A.reset} ${opts.sectionCount}`,
    `  ${A.dim}Saved to:${A.reset} ${opts.filePath}`,
  ];
  if (opts.blurb) {
    parts.push('');
    parts.push(`  ${A.dim}${opts.blurb}${A.reset}`);
  }
  parts.push(line);
  return parts.join('\n');
}
```

## Hardening Requirements

- `extractDesignSummary` must never throw — handle empty/malformed markdown gracefully
- Import `ANSI` from existing `beast-logger.ts` — do NOT define new color constants
- Blurb skips lines starting with `-` or `*` (list items aren't good summaries)
- `formatDesignCard` is pure (no side effects) — returns a string, does not write to stdout
- Do NOT parse markdown with a library — simple line-by-line regex is sufficient
