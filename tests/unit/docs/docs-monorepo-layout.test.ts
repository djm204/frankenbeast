import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

function readDoc(relativePath: string): string {
  const fullPath = resolve(ROOT, relativePath);
  if (!existsSync(fullPath)) return '';
  return readFileSync(fullPath, 'utf-8');
}

describe('CLAUDE.md — monorepo layout', () => {
  const doc = readDoc('CLAUDE.md');

  it('references packages/ layout', () => {
    expect(doc).toContain('packages/');
  });

  it('mentions npm workspaces', () => {
    expect(doc).toMatch(/npm workspaces|workspaces/i);
  });

  it('mentions Turborepo', () => {
    expect(doc).toMatch(/[Tt]urborepo|turbo/);
  });

  it('does not reference gitlinks', () => {
    expect(doc.toLowerCase()).not.toContain('gitlink');
  });

  it('does not reference .gitmodules', () => {
    expect(doc).not.toContain('.gitmodules');
  });

  it('does not reference submodules as current structure', () => {
    // "submodule" should not appear as a description of current layout
    expect(doc.toLowerCase()).not.toMatch(/submodule/);
  });
});

describe('docs/ARCHITECTURE.md — monorepo layout', () => {
  const doc = readDoc('docs/ARCHITECTURE.md');

  it('uses packages/ in directory structure references', () => {
    expect(doc).toContain('packages/');
  });

  it('does not reference gitlinks', () => {
    expect(doc.toLowerCase()).not.toContain('gitlink');
  });

  it('does not reference .gitmodules', () => {
    expect(doc).not.toContain('.gitmodules');
  });

  it('references ADR-011 for monorepo migration', () => {
    expect(doc).toMatch(/ADR.?011|011-/);
  });
});

describe('docs/RAMP_UP.md — monorepo layout', () => {
  const doc = readDoc('docs/RAMP_UP.md');

  it('uses turbo run commands for build/test', () => {
    expect(doc).toContain('turbo');
  });

  it('references packages/ layout in module table', () => {
    expect(doc).toContain('packages/');
  });

  it('does not reference gitlinks', () => {
    expect(doc.toLowerCase()).not.toContain('gitlink');
  });

  it('does not reference gitlink update workflow', () => {
    expect(doc.toLowerCase()).not.toContain('gitlink update');
  });

  it('does not use cd <module> && npm test pattern', () => {
    expect(doc).not.toMatch(/cd\s+\w+.*&&\s*npm\s+test/);
  });

  it('uses npx turbo or turbo run for per-module commands', () => {
    expect(doc).toMatch(/turbo run.*--filter|npx turbo/);
  });

  it('stays under 5000 words', () => {
    const wordCount = doc.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThan(5000);
  });

  it('mentions npm workspaces', () => {
    expect(doc).toMatch(/npm workspaces|workspaces/i);
  });

  it('references ADR-011', () => {
    expect(doc).toMatch(/ADR.?011|011-/);
  });
});
