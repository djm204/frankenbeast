import { describe, expect, it } from 'vitest';
import { isNoOpDesign } from '../../../src/cli/noop-detector.js';

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
