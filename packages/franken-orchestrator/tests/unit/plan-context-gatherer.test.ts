import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PlanContextGatherer } from '../../src/planning/plan-context-gatherer.js';

const FIXTURES_DIR = join(__dirname, '__fixtures__', 'plan-context');

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

describe('PlanContextGatherer', () => {
  beforeEach(() => {
    ensureDir(FIXTURES_DIR);
  });

  afterEach(() => {
    rmSync(FIXTURES_DIR, { recursive: true, force: true });
  });

  it('gathers RAMP_UP.md content', async () => {
    const docsDir = join(FIXTURES_DIR, 'docs');
    ensureDir(docsDir);
    writeFileSync(join(docsDir, 'RAMP_UP.md'), '# Ramp Up\n\nThis is the ramp-up doc.');

    const gatherer = new PlanContextGatherer(FIXTURES_DIR);
    const ctx = await gatherer.gather('Some design doc text');

    expect(ctx.rampUp).toBe('# Ramp Up\n\nThis is the ramp-up doc.');
  });

  it('extracts file signatures for paths mentioned in design doc', async () => {
    // Create a .ts file with exported and non-exported symbols
    const srcDir = join(FIXTURES_DIR, 'src', 'utils');
    ensureDir(srcDir);
    writeFileSync(
      join(FIXTURES_DIR, 'src', 'utils', 'helpers.ts'),
      [
        'export interface IHelper {',
        '  doStuff(): void;',
        '}',
        '',
        'export type HelperConfig = {',
        '  enabled: boolean;',
        '};',
        '',
        'export function createHelper(config: HelperConfig): IHelper {',
        '  return { doStuff: () => {} };',
        '}',
        '',
        'export class HelperImpl implements IHelper {',
        '  doStuff(): void {}',
        '}',
        '',
        'export const DEFAULT_CONFIG: HelperConfig = { enabled: true };',
        '',
        'export enum HelperMode {',
        '  Fast = "fast",',
        '  Slow = "slow",',
        '}',
        '',
        '// Internal function, should NOT appear',
        'function internalHelper(): void {}',
        '',
        'const privateThing = 42;',
        '',
        'class InternalClass {}',
      ].join('\n'),
    );

    // Reference the path in the design doc
    const designDoc = 'We need to modify src/utils/helpers.ts to add a new mode.';

    const gatherer = new PlanContextGatherer(FIXTURES_DIR);
    const ctx = await gatherer.gather(designDoc);

    expect(ctx.relevantSignatures).toHaveLength(1);
    expect(ctx.relevantSignatures[0]!.path).toBe('src/utils/helpers.ts');

    const sigs = ctx.relevantSignatures[0]!.signatures;
    // Exported symbols should be present
    expect(sigs).toContain('export interface IHelper');
    expect(sigs).toContain('export type HelperConfig');
    expect(sigs).toContain('export function createHelper');
    expect(sigs).toContain('export class HelperImpl');
    expect(sigs).toContain('export const DEFAULT_CONFIG');
    expect(sigs).toContain('export enum HelperMode');

    // Non-exported symbols should NOT be present
    expect(sigs).not.toContain('function internalHelper');
    expect(sigs).not.toContain('privateThing');
    expect(sigs).not.toContain('InternalClass');
  });

  it('gathers package dependencies', async () => {
    // Create a package.json under packages/my-pkg
    const pkgDir = join(FIXTURES_DIR, 'packages', 'my-pkg');
    ensureDir(pkgDir);
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@frankenbeast/my-pkg',
        dependencies: {
          zod: '^3.22.0',
          chalk: '^5.0.0',
        },
        devDependencies: {
          vitest: '^1.0.0',
          typescript: '^5.3.0',
        },
      }),
    );

    const designDoc = 'This feature modifies packages/my-pkg to add new functionality.';

    const gatherer = new PlanContextGatherer(FIXTURES_DIR);
    const ctx = await gatherer.gather(designDoc);

    expect(ctx.packageDeps['my-pkg']).toBeDefined();
    expect(ctx.packageDeps['my-pkg']).toContain('zod');
    expect(ctx.packageDeps['my-pkg']).toContain('chalk');
    expect(ctx.packageDeps['my-pkg']).toContain('vitest');
    expect(ctx.packageDeps['my-pkg']).toContain('typescript');
  });

  it('returns empty context when no RAMP_UP.md exists', async () => {
    const gatherer = new PlanContextGatherer(FIXTURES_DIR);
    const ctx = await gatherer.gather('Some design doc');

    expect(ctx.rampUp).toBe('');
  });

  it('returns empty signatures when no paths are mentioned', async () => {
    const gatherer = new PlanContextGatherer(FIXTURES_DIR);
    const ctx = await gatherer.gather('This design doc has no file paths in it.');

    expect(ctx.relevantSignatures).toEqual([]);
  });

  it('returns empty existingPatterns array', async () => {
    const gatherer = new PlanContextGatherer(FIXTURES_DIR);
    const ctx = await gatherer.gather('Some design doc');

    expect(ctx.existingPatterns).toEqual([]);
  });

  it('handles paths under packages/ directories', async () => {
    const srcDir = join(FIXTURES_DIR, 'packages', '@franken/brain', 'src');
    ensureDir(srcDir);
    writeFileSync(
      join(srcDir, 'memory.ts'),
      [
        'export interface IMemory {',
        '  store(key: string, value: unknown): void;',
        '}',
        '',
        'const internal = true;',
      ].join('\n'),
    );

    const designDoc = 'We will extend packages/@franken/brain/src/memory.ts with new storage.';

    const gatherer = new PlanContextGatherer(FIXTURES_DIR);
    const ctx = await gatherer.gather(designDoc);

    expect(ctx.relevantSignatures).toHaveLength(1);
    expect(ctx.relevantSignatures[0]!.path).toBe('packages/@franken/brain/src/memory.ts');
    expect(ctx.relevantSignatures[0]!.signatures).toContain('export interface IMemory');
    expect(ctx.relevantSignatures[0]!.signatures).not.toContain('internal');
  });

  it('skips paths mentioned in the design doc that do not exist on disk', async () => {
    const designDoc = 'We need to create src/nonexistent/file.ts for the feature.';

    const gatherer = new PlanContextGatherer(FIXTURES_DIR);
    const ctx = await gatherer.gather(designDoc);

    expect(ctx.relevantSignatures).toEqual([]);
  });

  it('deduplicates paths mentioned multiple times in the design doc', async () => {
    const srcDir = join(FIXTURES_DIR, 'src');
    ensureDir(srcDir);
    writeFileSync(join(srcDir, 'index.ts'), 'export const VERSION = "1.0.0";');

    const designDoc = 'Modify src/index.ts first, then revisit src/index.ts for cleanup.';

    const gatherer = new PlanContextGatherer(FIXTURES_DIR);
    const ctx = await gatherer.gather(designDoc);

    expect(ctx.relevantSignatures).toHaveLength(1);
  });
});
