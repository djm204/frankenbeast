# Issues Provider Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `frankenbeast issues` respect the selected provider and fallback chain across triage, decomposition, and execution.

**Architecture:** Keep the existing split between single-shot LLM adapter calls and Martin execution, but propagate provider configuration through the issues pipeline and add rate-limit fallback logic to `CliLlmAdapter`. Fix the hardcoded provider in `IssueRunner` so execution starts from the CLI-selected provider and chain.

**Tech Stack:** TypeScript, Vitest, Node.js child processes, workspace package `franken-orchestrator`

---

### Task 1: Forward the Selected Provider Through Issue Execution

**Files:**
- Modify: `packages/franken-orchestrator/src/issues/issue-runner.ts`
- Modify: `packages/franken-orchestrator/src/cli/session.ts`
- Test: `packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts`

**Step 1: Write the failing test**

Add a test proving `IssueRunner` passes the configured provider and fallback chain into `CliSkillConfig.martin` instead of hardcoding `claude`.

**Step 2: Run test to verify it fails**

Run: `npm test --workspace franken-orchestrator -- tests/unit/issues/issue-runner.test.ts`
Expected: FAIL because the executor receives `provider: 'claude'` regardless of config.

**Step 3: Write minimal implementation**

- Extend `IssueRunnerConfig` with `provider` and optional `providers`
- wire those fields from `Session.runIssues()`
- build `CliSkillConfig.martin` from config values

**Step 4: Run test to verify it passes**

Run: `npm test --workspace franken-orchestrator -- tests/unit/issues/issue-runner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/issues/issue-runner.ts \
        packages/franken-orchestrator/src/cli/session.ts \
        packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts
git commit -m "fix: honor provider selection in issues execution"
```

### Task 2: Add Single-Shot Provider Fallback to CliLlmAdapter

**Files:**
- Modify: `packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts`
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
- Test: `packages/franken-orchestrator/tests/unit/adapters/cli-llm-adapter.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- provider chain normalization with selected provider first
- switching from a rate-limited provider to the next provider
- sleeping and resetting after all providers in the chain are exhausted

**Step 2: Run test to verify it fails**

Run: `npm test --workspace franken-orchestrator -- tests/unit/adapters/cli-llm-adapter.test.ts`
Expected: FAIL because `CliLlmAdapter` only uses a single provider today.

**Step 3: Write minimal implementation**

- extend `CliLlmAdapter` options to accept registry access, fallback providers, and injectable sleep behavior for tests
- normalize the provider chain so the selected provider is first
- on provider-detected rate limit, rotate to the next provider
- when all providers are exhausted, sleep using the shortest parsed reset time, then retry from the original provider
- keep non-rate-limit failures as immediate failures

**Step 4: Run test to verify it passes**

Run: `npm test --workspace franken-orchestrator -- tests/unit/adapters/cli-llm-adapter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts \
        packages/franken-orchestrator/src/cli/dep-factory.ts \
        packages/franken-orchestrator/tests/unit/adapters/cli-llm-adapter.test.ts
git commit -m "fix: add provider fallback to cli llm adapter"
```

### Task 3: Verify Issues Pipeline Wiring End-to-End at Unit Level

**Files:**
- Test: `packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/adapters/cli-llm-adapter.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/skills/martin-loop.test.ts` (only if a regression test is needed)

**Step 1: Add any final regression test**

Only add a Martin test if the new provider normalization logic changes observable chain ordering.

**Step 2: Run targeted verification**

Run: `npm test --workspace franken-orchestrator -- tests/unit/issues/issue-runner.test.ts tests/unit/adapters/cli-llm-adapter.test.ts tests/unit/skills/martin-loop.test.ts`
Expected: PASS

**Step 3: Run broader provider-focused verification**

Run: `npm test --workspace franken-orchestrator -- tests/unit/cli/dep-factory-providers.test.ts tests/unit/skills/providers/claude-provider.test.ts tests/unit/skills/providers/codex-provider.test.ts tests/unit/skills/providers/gemini-provider.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts \
        packages/franken-orchestrator/tests/unit/adapters/cli-llm-adapter.test.ts \
        packages/franken-orchestrator/tests/unit/skills/martin-loop.test.ts
git commit -m "test: cover issues provider fallback"
```
