# Run Config Provider/Model Precedence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make top-level `runConfig.provider` and `runConfig.model` actually affect CLI dependency construction so spawned-agent config precedence is truthful.

**Architecture:** Keep the change inside `createCliDeps()` so the precedence contract is enforced at one boundary. Add unit tests in the existing dep-factory provider suite, then make the smallest precedence change needed to satisfy those tests without expanding into unused `runConfigOverrides` plumbing.

**Tech Stack:** TypeScript, Vitest, Frankenbeast CLI dep factory

---

### Task 1: Lock provider/model precedence with tests

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:
- top-level `runConfig.provider` overrides the CLI provider when `llmConfig.default.provider` is absent
- top-level `runConfig.model` is passed to `CliLlmAdapter` when `llmConfig.default.model` is absent
- `llmConfig.default.provider` and `llmConfig.default.model` still take precedence over top-level values

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/unit/cli/dep-factory-providers.test.ts`
Expected: FAIL on the new precedence assertions.

### Task 2: Implement minimal precedence fix

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`

**Step 1: Write minimal implementation**

Update `createCliDeps()` precedence to:
- use `runConfig.llmConfig.default.provider ?? runConfig.provider ?? options.provider`
- use `runConfig.llmConfig.default.model ?? runConfig.model ?? options.adapterModel`

Leave `runConfigOverrides` behavior unchanged.

**Step 2: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/unit/cli/dep-factory-providers.test.ts`
Expected: PASS

### Task 3: Verify the targeted Plan 1 surface

**Files:**
- No file changes

**Step 1: Run focused regression coverage**

Run: `npm --workspace franken-orchestrator test -- tests/unit/cli/dep-factory-providers.test.ts tests/unit/cli/run-config-loader.test.ts tests/unit/beasts/execution/config-passthrough.test.ts`
Expected: PASS

### Task 4: Commit and push

**Files:**
- Stage only the plan doc, test file, and dep-factory change

**Step 1: Commit**

```bash
git add docs/plans/2026-03-18-run-config-provider-model-precedence.md packages/franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts packages/franken-orchestrator/src/cli/dep-factory.ts
git commit -m "fix: honor run config provider and model precedence"
```

**Step 2: Push**

```bash
git push origin feat/plan1-execution-pipeline
```
