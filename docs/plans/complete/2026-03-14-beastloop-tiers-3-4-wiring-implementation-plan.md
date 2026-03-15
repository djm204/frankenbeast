# BeastLoop Tiers 3-4 Wiring Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `stubCritique` and `stubGovernor` in `createCliDeps()` with real module wiring using the existing `CritiquePortAdapter` and `GovernorPortAdapter`, with graceful fallback.

**Architecture:** Direct module instantiation in `createCliDeps()`, same pattern as Tiers 1-2 (firewall, skills, memory). Each module is constructed inside a `try/catch` with stub fallback. Critique uses `createReviewer()` from `@franken/critique` with lightweight port stubs. Governor uses `ApprovalGateway` + `CliChannel` from `@franken/governor` with readline-based HITL.

**Tech Stack:** TypeScript, Vitest, `@franken/critique`, `@franken/governor`, `node:readline/promises`

---

## File Structure

| File | Responsibility | Change Type |
|------|----------------|-------------|
| `packages/franken-orchestrator/src/cli/dep-factory.ts` | Wire critique + governor modules into `createCliDeps()` | Modify |
| `packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts` | Integration tests verifying real adapters are created + stub fallback | Modify |

**Rationale:** The adapters (`critique-adapter.ts`, `governor-adapter.ts`) and their unit tests already exist and are comprehensive (see `tests/unit/adapters/critique-adapter.test.ts` and `governor-adapter.test.ts`). The spec's testing strategy references three new test files, but since adapter unit tests are already complete, only integration-level coverage in the existing `dep-factory-wiring.test.ts` is needed. No new files required.

---

## Chunk 1: Critique + Governor Wiring

### Task 1: Wire Critique Module in dep-factory

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts:110-112,362-368`
- Modify: `packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts`

- [ ] **Step 1: Write the failing integration test — critique is real adapter**

Add a top-level import to `tests/integration/cli/dep-factory-wiring.test.ts` (alongside the existing imports):

```typescript
import { CritiquePortAdapter } from '../../../src/adapters/critique-adapter.js';
```

Then add this test inside the existing `describe` block:

```typescript
it('creates real CritiquePortAdapter when modules are enabled', async () => {
  const paths = createTempPaths();
  cleanups.push(paths.root);

  const { deps, finalize } = await createCliDeps({
    paths,
    baseBranch: 'main',
    budget: 1.0,
    provider: 'claude',
    noPr: true,
    verbose: false,
    reset: false,
  });

  expect(deps.critique).toBeInstanceOf(CritiquePortAdapter);
  await finalize();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/integration/cli/dep-factory-wiring.test.ts`
Expected: FAIL — `deps.critique` is still `stubCritique` (plain object), not `CritiquePortAdapter`

- [ ] **Step 3: Write the failing integration test — critique uses stub when disabled**

Add to `tests/integration/cli/dep-factory-wiring.test.ts`:

```typescript
it('uses critique stub when enabledModules.critique is false', async () => {
  const paths = createTempPaths();
  cleanups.push(paths.root);

  const { deps, finalize } = await createCliDeps({
    paths,
    baseBranch: 'main',
    budget: 1.0,
    provider: 'claude',
    noPr: true,
    verbose: false,
    reset: false,
    enabledModules: { critique: false },
  });

  expect(deps.critique).not.toBeInstanceOf(CritiquePortAdapter);
  // Stub should auto-pass
  const result = await deps.critique.reviewPlan({ tasks: [] });
  expect(result).toEqual({ verdict: 'pass', findings: [], score: 1.0 });
  await finalize();
});
```

- [ ] **Step 4: Run test to verify this test PASSES (stub is already the default)**

Run: `cd packages/franken-orchestrator && npx vitest run tests/integration/cli/dep-factory-wiring.test.ts`
Expected: The new "critique stub when disabled" test PASSES (default behavior is stub). The "real CritiquePortAdapter" test FAILS.

- [ ] **Step 5: Wire critique in `dep-factory.ts`**

In `dep-factory.ts`, add imports after the existing firewall/skills/memory imports (around line 18-21):

```typescript
import { CritiquePortAdapter } from '../adapters/critique-adapter.js';
```

Replace `critique: stubCritique` (line 368) in the `deps` object with a variable `critique`, and add the wiring block. Insert this after the Memory wiring block (after line ~310) and before the PR creator section (line ~312):

```typescript
  // Critique (dynamic import — optional module)
  let critique: ICritiqueModule = stubCritique;
  if (modules.critique) {
    try {
      const critiqueModule = await import('@franken/critique');
      const { createReviewer } = critiqueModule;

      const critiqueGuardrails = {
        getSafetyRules: async () => [] as never[],
        executeSandbox: async () => ({ success: true as const, output: '', exitCode: 0, timedOut: false }),
      };
      const critiqueMemory = {
        searchADRs: async () => [] as never[],
        searchEpisodic: async () => [] as never[],
        recordLesson: async () => {},
      };
      const critiqueObservability = {
        getTokenSpend: async () => {
          const spend = observerBridge.getSpend();
          return { totalTokens: spend.totalTokens, totalCostUsd: spend.totalCostUsd };
        },
      };

      const knownPackages = discoverWorkspacePackages(paths.root);

      const reviewer = createReviewer({
        guardrails: critiqueGuardrails,
        memory: critiqueMemory,
        observability: critiqueObservability,
        knownPackages,
      });

      critique = new CritiquePortAdapter({
        loop: { run: (input: never, config: never) => reviewer.review(input, config) },
        config: {
          maxIterations: options.critiqueMaxIterations ?? 3,
          tokenBudget: budget,
          consensusThreshold: options.critiqueConsensusThreshold ?? 0.7,
          sessionId: `cli-critique-${Date.now()}`,
          taskId: 'plan-review',
        },
      });
    } catch (error) {
      logger.warn(`Critique module unavailable, using stub: ${error instanceof Error ? error.message : String(error)}`, 'dep-factory');
    }
  }
```

Add the `discoverWorkspacePackages` helper function before `createCliDeps()`:

```typescript
function discoverWorkspacePackages(root: string): string[] {
  const packagesDir = resolve(root, 'packages');
  try {
    return readdirSync(packagesDir)
      .map(dir => {
        try {
          const pkg = JSON.parse(
            readFileSync(resolve(packagesDir, dir, 'package.json'), 'utf-8'),
          );
          return pkg.name as string;
        } catch { return null; }
      })
      .filter((name): name is string => name !== null);
  } catch { return []; }
}
```

Add `readFileSync` to the existing `node:fs` import at line 1.

Add `critiqueMaxIterations` and `critiqueConsensusThreshold` to `CliDepOptions`:

```typescript
  /** Max critique loop iterations before halting. Default: 3. */
  critiqueMaxIterations?: number;
  /** Consensus threshold for critique pass verdict. Default: 0.7. */
  critiqueConsensusThreshold?: number;
```

Update the `deps` object to use the new `critique` variable instead of `stubCritique`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/franken-orchestrator && npx vitest run tests/integration/cli/dep-factory-wiring.test.ts`
Expected: All tests PASS including the new "creates real CritiquePortAdapter" test.

- [ ] **Step 7: Run full package tests + typecheck**

Run: `cd packages/franken-orchestrator && npx vitest run && npx tsc --noEmit`
Expected: All existing tests still pass. No type errors. No regressions.

- [ ] **Step 8: Commit**

```bash
git add packages/franken-orchestrator/src/cli/dep-factory.ts packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts
git commit -m "feat(orchestrator): wire critique module in dep-factory with fallback"
```

---

### Task 2: Wire Governor Module in dep-factory

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
- Modify: `packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts`

- [ ] **Step 1: Write the failing integration test — governor is real adapter**

Add a top-level import to `tests/integration/cli/dep-factory-wiring.test.ts` (alongside the existing imports):

```typescript
import { GovernorPortAdapter } from '../../../src/adapters/governor-adapter.js';
```

Then add this test inside the existing `describe` block:

```typescript
it('creates real GovernorPortAdapter when modules are enabled', async () => {
  const paths = createTempPaths();
  cleanups.push(paths.root);

  const { deps, finalize } = await createCliDeps({
    paths,
    baseBranch: 'main',
    budget: 1.0,
    provider: 'claude',
    noPr: true,
    verbose: false,
    reset: false,
  });

  expect(deps.governor).toBeInstanceOf(GovernorPortAdapter);
  await finalize();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/integration/cli/dep-factory-wiring.test.ts`
Expected: FAIL — `deps.governor` is still `stubGovernor`

- [ ] **Step 3: Write the failing integration test — governor uses stub when disabled**

```typescript
it('uses governor stub when enabledModules.governor is false', async () => {
  const paths = createTempPaths();
  cleanups.push(paths.root);

  const { deps, finalize } = await createCliDeps({
    paths,
    baseBranch: 'main',
    budget: 1.0,
    provider: 'claude',
    noPr: true,
    verbose: false,
    reset: false,
    enabledModules: { governor: false },
  });

  expect(deps.governor).not.toBeInstanceOf(GovernorPortAdapter);
  // Stub should auto-approve
  const result = await deps.governor.requestApproval({
    taskId: 'test', summary: 'test', requiresHitl: true,
  });
  expect(result).toEqual({ decision: 'approved' });
  await finalize();
});
```

- [ ] **Step 4: Run test to verify stub test PASSES, real adapter test FAILS**

Run: `cd packages/franken-orchestrator && npx vitest run tests/integration/cli/dep-factory-wiring.test.ts`
Expected: Stub test passes. Real adapter test fails.

- [ ] **Step 5: Change `finalize` from `const` to `let`**

In `dep-factory.ts`, the `finalize` variable (around line 354) is currently declared as `const`. Change it to `let` so the governor wiring can wrap it with readline cleanup:

```typescript
// Before:
const finalize = async () => {
// After:
let finalize = async () => {
```

- [ ] **Step 6: Wire governor in `dep-factory.ts`**

Add import:

```typescript
import { GovernorPortAdapter } from '../adapters/governor-adapter.js';
```

Add the governor wiring block after the critique block, before the PR creator section:

```typescript
  // Governor (dynamic import — optional module)
  let governor: IGovernorModule = stubGovernor;
  if (modules.governor) {
    try {
      const { ApprovalGateway, CliChannel, defaultConfig } = await import('@franken/governor');
      const { createInterface } = await import('node:readline/promises');
      const { stdin, stdout } = await import('node:process');

      const useDefaultDecision = !stdin.isTTY;

      const rl = createInterface({ input: stdin, output: stdout });

      const cliChannel = new CliChannel({
        readline: { question: (prompt: string) => rl.question(prompt) },
        operatorName: 'operator',
      });

      const noopAuditRecorder = {
        record: async () => {},
      };

      const gateway = new ApprovalGateway({
        channel: cliChannel,
        auditRecorder: noopAuditRecorder,
        config: defaultConfig(),
      });

      governor = new GovernorPortAdapter({
        gateway: gateway as unknown as import('../adapters/governor-adapter.js').GovernorPortAdapterDeps['gateway'],
        projectId: basename(paths.root),
        ...(useDefaultDecision ? { defaultDecision: 'approved' as const } : {}),
      });

      // Close readline on finalize to prevent dangling handles
      const previousFinalize = finalize;
      finalize = async () => {
        rl.close();
        await previousFinalize();
      };
    } catch (error) {
      logger.warn(`Governor module unavailable, using stub: ${error instanceof Error ? error.message : String(error)}`, 'dep-factory');
    }
  }
```

Update the `deps` object to use the new `governor` variable instead of `stubGovernor`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd packages/franken-orchestrator && npx vitest run tests/integration/cli/dep-factory-wiring.test.ts`
Expected: All tests PASS.

- [ ] **Step 8: Run full package tests + typecheck**

Run: `cd packages/franken-orchestrator && npx vitest run && npx tsc --noEmit`
Expected: All tests pass. No type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/franken-orchestrator/src/cli/dep-factory.ts packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts
git commit -m "feat(orchestrator): wire governor module in dep-factory with HITL channel and fallback"
```

---

### Task 3: Update design doc status + move to complete

**Files:**
- Modify: `docs/plans/2026-03-13-beastloop-tiers-3-4-wiring-design.md`

- [ ] **Step 1: Update design doc status from Draft to Implemented**

Change `**Status:** Draft` to `**Status:** Implemented` in the design doc header.

- [ ] **Step 2: Move design doc to complete folder**

```bash
cp docs/plans/2026-03-13-beastloop-tiers-3-4-wiring-design.md docs/plans/complete/
cp docs/plans/2026-03-14-beastloop-tiers-3-4-wiring-implementation-plan.md docs/plans/complete/
rm docs/plans/2026-03-13-beastloop-tiers-3-4-wiring-design.md
rm docs/plans/2026-03-14-beastloop-tiers-3-4-wiring-implementation-plan.md
```

- [ ] **Step 3: Update INCOMPLETE-PLANS.md — remove Tiers 3-4 entry**

If `docs/plans/INCOMPLETE-PLANS.md` exists, remove the "BeastLoop Tiers 3-4 Wiring (Critique + Governor)" entry from the "NOT STARTED" section (item 4). Also update the priority recommendation section to remove the "Tiers 3-4 Wiring" line.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/
git commit -m "docs: mark beastloop tiers 3-4 wiring as implemented"
```
