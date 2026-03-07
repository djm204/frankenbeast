# Chunk 02: Project Root Detection & .frankenbeast/ Scaffolding

## Objective

Create `project-root.ts` — detects the project root directory and scaffolds the `.frankenbeast/` directory structure. This is the foundation for all file I/O in subsequent chunks.

## Files

- **Create**: `franken-orchestrator/src/cli/project-root.ts`
- **Create**: `franken-orchestrator/tests/unit/cli/project-root.test.ts`
- **Modify**: `franken-orchestrator/src/index.ts` — export `resolveProjectRoot`, `scaffoldFrankenbeast`

## Key Reference Files

- `franken-orchestrator/src/cli/args.ts` — `CliArgs.baseDir`
- `docs/plans/2026-03-06-cli-e2e-design.md` — project layout spec

## Implementation

```typescript
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

export interface ProjectPaths {
  root: string;
  frankenbeastDir: string;
  plansDir: string;
  buildDir: string;
  checkpointFile: string;
  tracesDb: string;
  logFile: string;
  designDocFile: string;
  configFile: string;
}

/**
 * Resolves the project root from --base-dir or cwd.
 * Validates the directory exists.
 */
export function resolveProjectRoot(baseDir: string): string {
  const root = resolve(baseDir);
  if (!existsSync(root)) {
    throw new Error(`Project root does not exist: ${root}`);
  }
  return root;
}

/**
 * Returns all conventional paths within .frankenbeast/.
 */
export function getProjectPaths(root: string): ProjectPaths {
  const frankenbeastDir = resolve(root, '.frankenbeast');
  const plansDir = resolve(frankenbeastDir, 'plans');
  const buildDir = resolve(frankenbeastDir, '.build');
  return {
    root,
    frankenbeastDir,
    plansDir,
    buildDir,
    checkpointFile: resolve(buildDir, '.checkpoint'),
    tracesDb: resolve(buildDir, 'build-traces.db'),
    logFile: resolve(buildDir, 'build.log'),
    designDocFile: resolve(plansDir, 'design.md'),
    configFile: resolve(frankenbeastDir, 'config.json'),
  };
}

/**
 * Creates .frankenbeast/ directory structure if it doesn't exist.
 */
export function scaffoldFrankenbeast(paths: ProjectPaths): void {
  mkdirSync(paths.plansDir, { recursive: true });
  mkdirSync(paths.buildDir, { recursive: true });
}
```

## Test Cases

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveProjectRoot, getProjectPaths, scaffoldFrankenbeast } from '../../../src/cli/project-root.js';

describe('project-root', () => {
  const testDir = resolve(tmpdir(), 'fb-test-project-root');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('resolveProjectRoot', () => {
    it('resolves an existing directory', () => {
      expect(resolveProjectRoot(testDir)).toBe(testDir);
    });

    it('throws for non-existent directory', () => {
      expect(() => resolveProjectRoot('/nonexistent/path')).toThrow('Project root does not exist');
    });

    it('resolves relative paths to absolute', () => {
      const result = resolveProjectRoot('.');
      expect(result).toBe(resolve('.'));
    });
  });

  describe('getProjectPaths', () => {
    it('returns all conventional paths', () => {
      const paths = getProjectPaths(testDir);
      expect(paths.root).toBe(testDir);
      expect(paths.frankenbeastDir).toBe(resolve(testDir, '.frankenbeast'));
      expect(paths.plansDir).toBe(resolve(testDir, '.frankenbeast/plans'));
      expect(paths.buildDir).toBe(resolve(testDir, '.frankenbeast/.build'));
      expect(paths.checkpointFile).toBe(resolve(testDir, '.frankenbeast/.build/.checkpoint'));
      expect(paths.tracesDb).toBe(resolve(testDir, '.frankenbeast/.build/build-traces.db'));
      expect(paths.logFile).toBe(resolve(testDir, '.frankenbeast/.build/build.log'));
      expect(paths.designDocFile).toBe(resolve(testDir, '.frankenbeast/plans/design.md'));
      expect(paths.configFile).toBe(resolve(testDir, '.frankenbeast/config.json'));
    });
  });

  describe('scaffoldFrankenbeast', () => {
    it('creates .frankenbeast directory structure', () => {
      const paths = getProjectPaths(testDir);
      scaffoldFrankenbeast(paths);
      expect(existsSync(paths.plansDir)).toBe(true);
      expect(existsSync(paths.buildDir)).toBe(true);
    });

    it('is idempotent', () => {
      const paths = getProjectPaths(testDir);
      scaffoldFrankenbeast(paths);
      scaffoldFrankenbeast(paths);
      expect(existsSync(paths.plansDir)).toBe(true);
    });
  });
});
```

## Success Criteria

- [ ] `resolveProjectRoot()` resolves and validates directory existence
- [ ] `getProjectPaths()` returns all conventional `.frankenbeast/` paths
- [ ] `scaffoldFrankenbeast()` creates `plans/` and `.build/` directories
- [ ] Scaffolding is idempotent
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run tests/unit/cli/project-root.test.ts`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/cli/project-root.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- Use `resolve()` to normalize all paths — never join with string concatenation
- `scaffoldFrankenbeast` must use `{ recursive: true }` — safe to call repeatedly
- Do NOT read or write any files — that's for later chunks
- Export `ProjectPaths` as a type
- Use `.js` extensions in all import paths
