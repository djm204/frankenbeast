import { describe, it, expect } from 'vitest';
import { TurnSummarizer } from '../../../src/chat/turn-summarizer.js';

describe('TurnSummarizer', () => {
  it('summarizes a successful execution', () => {
    const result = {
      status: 'success' as const,
      summary: 'Fixed login bug',
      filesChanged: ['src/auth.ts', 'tests/auth.test.ts'],
      testsRun: 5,
      errors: [],
    };
    const summary = TurnSummarizer.summarize(result);
    expect(summary).toContain('Fixed login bug');
    expect(summary).toContain('2 file(s)');
    expect(summary).toContain('5 test(s)');
  });

  it('includes error info for failed executions', () => {
    const result = {
      status: 'failed' as const,
      summary: 'Build failed',
      filesChanged: [],
      testsRun: 0,
      errors: ['TypeError: cannot read property of undefined'],
    };
    const summary = TurnSummarizer.summarize(result);
    expect(summary).toContain('failed');
    expect(summary).toContain('TypeError');
  });

  it('truncates long summaries to 500 chars', () => {
    const result = {
      status: 'success' as const,
      summary: 'A'.repeat(1000),
      filesChanged: [],
      testsRun: 0,
      errors: [],
    };
    const summary = TurnSummarizer.summarize(result);
    expect(summary.length).toBeLessThanOrEqual(500);
  });
});
