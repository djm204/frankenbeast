import { describe, expect, it } from 'vitest';
import { extractDesignSummary, formatDesignCard } from '../../../src/cli/design-summary.js';

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
    expect(summary.blurb.endsWith('...')).toBe(true);
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
      filePath: '.fbeast/plans/design.md',
    });

    expect(card).toContain('Observer Module');
    expect(card).toContain('4');
    expect(card).toContain('.fbeast/plans/design.md');
    expect(card).toContain('observer needs validation');
  });
});
