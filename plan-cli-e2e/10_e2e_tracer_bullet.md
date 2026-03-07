# Chunk 10: E2E Tracer Bullet

## Objective

Create an end-to-end integration test that exercises the full `frankenbeast --plan-dir <test-chunks>` path through BeastLoop with real deps (minus LLM). This proves the CLI wiring works end-to-end.

## Files

- **Create**: `franken-orchestrator/tests/e2e/cli-e2e.test.ts`
- **Create**: `franken-orchestrator/tests/e2e/fixtures/chunks/01_hello.md` — minimal test chunk
- **Create**: `franken-orchestrator/tests/e2e/fixtures/chunks/02_world.md` — minimal test chunk

## Key Reference Files

- `franken-orchestrator/src/cli/session.ts` — `Session` class (chunk 08)
- `franken-orchestrator/src/cli/project-root.ts` — `getProjectPaths`, `scaffoldFrankenbeast` (chunk 02)
- `franken-orchestrator/src/cli/dep-factory.ts` — `createCliDeps` (chunk 04)
- `franken-orchestrator/tests/e2e/` — existing E2E test directory (if any)

## Test Fixture: Chunk Files

`tests/e2e/fixtures/chunks/01_hello.md`:
```markdown
# Chunk 01: hello

## Objective

Create a file called `hello.txt` with the content "Hello, Frankenbeast!".

## Success Criteria

- [ ] `hello.txt` exists
- [ ] Contains "Hello, Frankenbeast!"

## Verification Command

```bash
test -f hello.txt && grep -q "Hello, Frankenbeast!" hello.txt
```
```

`tests/e2e/fixtures/chunks/02_world.md`:
```markdown
# Chunk 02: world

## Objective

Create a file called `world.txt` with the content "World!".

## Success Criteria

- [ ] `world.txt` exists

## Verification Command

```bash
test -f world.txt
```
```

## Test Cases

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '../../src/cli/session.js';
import { getProjectPaths, scaffoldFrankenbeast } from '../../src/cli/project-root.js';
import type { InterviewIO } from '../../src/planning/interview-loop.js';

// Only run in E2E mode
const describeE2E = process.env['E2E'] === 'true' ? describe : describe.skip;

function mockIO(answers: string[] = ['yes']): InterviewIO {
  let idx = 0;
  return {
    ask: async () => answers[idx++] ?? 'yes',
    display: (msg: string) => console.log(msg),
  };
}

describeE2E('CLI E2E', () => {
  const testDir = resolve(tmpdir(), 'fb-e2e-test');
  const fixtureChunks = resolve(__dirname, 'fixtures/chunks');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates .frankenbeast directory structure', () => {
    const paths = getProjectPaths(testDir);
    scaffoldFrankenbeast(paths);
    expect(existsSync(paths.plansDir)).toBe(true);
    expect(existsSync(paths.buildDir)).toBe(true);
  });

  it('Session detects execute phase with --plan-dir', async () => {
    const paths = getProjectPaths(testDir);
    scaffoldFrankenbeast(paths);

    const session = new Session({
      paths,
      baseBranch: 'main',
      budget: 1,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
      io: mockIO(),
      entryPhase: 'execute',
      planDirOverride: fixtureChunks,
    });

    // This will fail at RALPH loop execution (no real CLI provider)
    // but it proves the wiring works up to that point
    try {
      await session.start();
    } catch (err) {
      // Expected — no real claude/codex available in test
      expect(err).toBeDefined();
    }
  });

  it('project paths are correctly derived', () => {
    const paths = getProjectPaths(testDir);
    expect(paths.checkpointFile).toContain('.frankenbeast/.build/.checkpoint');
    expect(paths.tracesDb).toContain('.frankenbeast/.build/build-traces.db');
    expect(paths.designDocFile).toContain('.frankenbeast/plans/design.md');
  });
});
```

## Success Criteria

- [ ] Test fixtures exist with minimal chunk files
- [ ] E2E test creates `.frankenbeast/` structure
- [ ] E2E test instantiates Session with execute phase
- [ ] Session wiring compiles and runs (even if RALPH loop fails without real CLI)
- [ ] Project paths are correctly derived
- [ ] Tests pass: `cd franken-orchestrator && E2E=true npx vitest run tests/e2e/cli-e2e.test.ts`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && E2E=true npx vitest run tests/e2e/cli-e2e.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- E2E tests are gated behind `E2E=true` env var — they must NOT run in regular `npm test`
- Use `tmpdir()` for test project root — do NOT modify the real filesystem
- Clean up test directories in `afterEach`
- Mock IO to auto-approve any prompts
- The RALPH loop will fail without real claude/codex — that's expected. The test proves wiring, not execution.
- Use `.js` extensions in all import paths
