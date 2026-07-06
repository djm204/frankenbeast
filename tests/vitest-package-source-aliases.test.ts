import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFrankenSourceAliases } from '../scripts/vitest-source-aliases.js';

const ROOT = join(import.meta.dirname, '..');

const EXPECTED_ALIASES = {
  '@franken/brain': resolve(ROOT, 'packages/franken-brain/src/index.ts'),
  '@franken/planner': resolve(ROOT, 'packages/franken-planner/src/index.ts'),
  '@franken/observer': resolve(ROOT, 'packages/franken-observer/src/index.ts'),
  '@franken/critique': resolve(ROOT, 'packages/franken-critique/src/index.ts'),
  '@franken/governor': resolve(ROOT, 'packages/franken-governor/src/index.ts'),
  '@franken/types': resolve(ROOT, 'packages/franken-types/src/index.ts'),
  '@franken/orchestrator': resolve(ROOT, 'packages/franken-orchestrator/src/index.ts'),
};

const PACKAGE_CONFIGS = [
  'packages/franken-brain/vitest.config.ts',
  'packages/franken-critique/vitest.config.ts',
  'packages/franken-governor/vitest.config.ts',
  'packages/franken-mcp-suite/vitest.config.ts',
  'packages/franken-observer/vitest.config.ts',
  'packages/franken-orchestrator/vitest.config.ts',
  'packages/franken-planner/vitest.config.ts',
  'packages/franken-types/vitest.config.ts',
  'packages/franken-web/vitest.config.ts',
];

describe('package Vitest source aliases', () => {
  it('maps every first-party package scope to its TypeScript source entrypoint', () => {
    expect(createFrankenSourceAliases(new URL('../packages/franken-orchestrator/vitest.config.ts', import.meta.url))).toEqual(
      EXPECTED_ALIASES,
    );
  });

  it('wires source aliases into each package-level Vitest config', () => {
    for (const configPath of PACKAGE_CONFIGS) {
      const config = readFileSync(join(ROOT, configPath), 'utf8');
      expect(config, `${configPath} should import the shared source alias helper`).toContain(
        'createFrankenSourceAliases',
      );
      expect(config, `${configPath} should pass its own import.meta.url to resolve aliases from the package root`).toContain(
        'createFrankenSourceAliases(import.meta.url)',
      );
    }
  });
});

describe('turbo test task', () => {
  it('does not force package builds before local test runs', () => {
    const turbo = JSON.parse(readFileSync(join(ROOT, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { dependsOn?: string[] }>;
    };

    expect(turbo.tasks.test?.dependsOn ?? []).not.toContain('build');
  });
});
