import { describe, it, expect, vi } from 'vitest';

/**
 * Regression test for issue #364 (Codex round-1 P2).
 *
 * `dep-factory` statically imports `createBeastDeps` from this module, so if
 * `create-beast-deps.ts` carries a *top-level* static import of the optional
 * `@franken/critique` package, then a genuinely-absent `@franken/critique`
 * makes the whole module graph fail to evaluate. That happens BEFORE
 * `createCliDeps()` can honour `modules.critique=false` or the
 * `FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1` opt-out — silently breaking the
 * disabled-module and unsafe-opt-out paths the ADR/tests promise.
 *
 * Note: the sibling `dep-factory-providers.test.ts` mocks `create-beast-deps.js`
 * wholesale, so it cannot catch this. This test deliberately exercises the REAL
 * module while simulating an absent `@franken/critique`.
 */

// Simulate `@franken/critique` not being installed.
vi.mock('@franken/critique', () => {
  throw Object.assign(
    new Error("Cannot find package '@franken/critique' imported from create-beast-deps.ts"),
    { code: 'ERR_MODULE_NOT_FOUND' },
  );
});

describe('create-beast-deps optional @franken/critique loading', () => {
  it('module still evaluates when @franken/critique is absent (keeps fail-closed path reachable)', async () => {
    const mod = await import('../../../src/cli/create-beast-deps.js');
    expect(typeof mod.createBeastDeps).toBe('function');
  });
});
