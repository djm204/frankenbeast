import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const README = readFileSync(resolve(ROOT, 'README.md'), 'utf-8');
const ISSUE_GUIDE = readFileSync(resolve(ROOT, 'docs/guides/fix-github-issues.md'), 'utf-8');

function sectionBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expectFlagToken(source: string, flag: string): void {
  expect(source).toMatch(new RegExp(`(^|[^\\w-])${escapeRegex(flag)}([^\\w-]|$)`));
}

describe('README issue workflow flags', () => {
  it('keeps the quick-reference aligned with the dedicated issue guide', () => {
    const readmeIssueFlags = sectionBetween(
      README,
      '**Issues-specific flags:**',
      '**Chat server flags:**',
    );

    for (const flag of [
      '--label <labels>',
      '--search <query>',
      '--milestone <name>',
      '--assignee <user>',
      '--limit <n>',
      '--repo <owner/repo>',
      '--target-upstream',
      '--dry-run',
    ]) {
      expect(ISSUE_GUIDE).toContain(flag);
      expectFlagToken(readmeIssueFlags, flag);
    }

    for (const flag of ['--budget', '--provider', '--providers', '--no-pr']) {
      expectFlagToken(readmeIssueFlags, flag);
    }

    expect(readmeIssueFlags).toContain('docs/guides/fix-github-issues.md');
  });
});
