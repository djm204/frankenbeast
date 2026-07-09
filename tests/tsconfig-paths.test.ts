import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const readJson = (rel: string) =>
  JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

const EXPECTED_ALIASES: Record<string, string> = {
  '@franken/brain': './packages/franken-brain/src/index.ts',
  '@franken/planner': './packages/franken-planner/src/index.ts',
  '@franken/observer': './packages/franken-observer/src/index.ts',
  '@franken/critique': './packages/franken-critique/src/index.ts',
  '@franken/governor': './packages/franken-governor/src/index.ts',
  '@franken/types/path-containment': './packages/franken-types/src/path-containment.ts',
  '@franken/types': './packages/franken-types/src/index.ts',
  '@franken/orchestrator': './packages/franken-orchestrator/src/index.ts',
};

describe('tsconfig.json path aliases', () => {
  const tsconfig = readJson('tsconfig.json');
  const paths = tsconfig.compilerOptions?.paths;

  it('has paths defined', () => {
    expect(paths).toBeDefined();
  });

  it('has exactly 8 aliases', () => {
    expect(Object.keys(paths)).toHaveLength(8);
  });

  for (const [alias, expectedPath] of Object.entries(EXPECTED_ALIASES)) {
    it(`${alias} -> ${expectedPath}`, () => {
      expect(paths[alias]).toEqual([expectedPath]);
    });
  }

  it('exposes only @franken-scoped first-party aliases', () => {
    expect(Object.keys(paths).sort()).toEqual(Object.keys(EXPECTED_ALIASES).sort());
    for (const alias of Object.keys(paths)) {
      expect(alias, `${alias} must use the canonical @franken scope`).toMatch(/^@franken\//);
    }
  });

  it('has no root-level module paths (no ./franken-* or ./frankenfirewall/)', () => {
    const raw = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8');
    // Should not match paths like "./franken-brain/" or "./frankenfirewall/"
    // but should match "./packages/franken-brain/" etc.
    expect(raw).not.toMatch(/"\.\/franken-[^"]*\/src/);
    expect(raw).not.toMatch(/"\.\/frankenfirewall\/src/);
  });

  it('keeps include as empty array', () => {
    expect(tsconfig.include).toEqual([]);
  });
});

describe('tsconfig.test.json includes', () => {
  const tsconfigTest = readJson('tsconfig.test.json');
  const includes = tsconfigTest.include;

  it('has include array', () => {
    expect(includes).toBeDefined();
    expect(Array.isArray(includes)).toBe(true);
  });

  it('includes tests/**/*', () => {
    expect(includes).toContain('tests/**/*');
  });

  const modulesInTestConfig = [
    'franken-brain',
    'franken-critique',
    'franken-governor',
    'franken-observer',
    'franken-planner',
  ];

  for (const mod of modulesInTestConfig) {
    it(`includes packages/${mod}/src/**/*`, () => {
      expect(includes).toContain(`packages/${mod}/src/**/*`);
    });
  }

  it('has no root-level module paths (no franken-*/src or frankenfirewall/src)', () => {
    const raw = readFileSync(join(ROOT, 'tsconfig.test.json'), 'utf8');
    // Should not match bare module paths like "franken-brain/src"
    // but should match "packages/franken-brain/src"
    expect(raw).not.toMatch(/"franken-[^"]*\/src/);
    expect(raw).not.toMatch(/"frankenfirewall\/src/);
  });
});
