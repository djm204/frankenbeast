import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const helpersSourceUrl = new URL(
  '../../../src/providers/discover-skills-helpers.ts',
  import.meta.url,
);

describe('discover-skills helpers source hygiene', () => {
  it('does not ship stray console.log debug output', async () => {
    const source = await readFile(helpersSourceUrl, 'utf-8');

    expect(source).not.toMatch(/console\.log\s*\(/);
    expect(source).not.toContain("console.log('debug')");
  });
});
