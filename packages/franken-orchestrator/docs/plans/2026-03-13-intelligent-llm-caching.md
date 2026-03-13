# Intelligent LLM Caching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build native-first, Frankenbeast-managed LLM caching that reduces repeated token spend across planning, execution-adjacent workflows, issues, chat, and PR generation while safely isolating unrelated work scopes.

**Architecture:** Introduce a cache subsystem that separates `project`, `work`, and `step` scopes; persist provider-native session metadata per work scope; wrap existing `ILlmClient` calls in a `CachedLlmClient` that classifies prompt material into stable/work/volatile layers and falls back cleanly when native reuse is unavailable. Integrate the wrapper into all major call sites and add cache metrics plus invalidation rules.

**Tech Stack:** TypeScript, Vitest, file-backed JSON stores under `.frankenbeast/`, existing CLI/provider abstractions, Node fs/path APIs.

---

### Task 1: Define cache model and persistence contracts

**Files:**
- Create: `src/cache/llm-cache-types.ts`
- Create: `src/cache/prompt-fingerprint.ts`
- Create: `src/cache/llm-cache-store.ts`
- Create: `src/cache/provider-session-store.ts`
- Create: `tests/unit/cache/llm-cache-store.test.ts`
- Create: `tests/unit/cache/provider-session-store.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:

- project-stable entries persist across process restarts
- work entries are isolated by work id
- provider session metadata is stored under one work scope and not visible to another
- schema/provider/model fingerprint mismatches invalidate old metadata

Include concrete expectations like:

```ts
expect(store.getProjectEntry(projectKey, stableKey)?.content).toBe('stable prompt');
expect(store.getWorkEntry(projectKey, 'issue:110', workKey)).toBeUndefined();
expect(sessionStore.load(scope99)?.sessionId).toBe('provider-session-99');
expect(sessionStore.load(scope110)).toBeUndefined();
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cache/llm-cache-store.test.ts tests/unit/cache/provider-session-store.test.ts`
Expected: FAIL because cache modules do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- cache scope types and manifest schema
- normalized fingerprint helpers
- file-backed store for project/work entries
- provider session store with versioned metadata and invalidation checks

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/cache/llm-cache-store.test.ts tests/unit/cache/provider-session-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cache/llm-cache-types.ts src/cache/prompt-fingerprint.ts src/cache/llm-cache-store.ts src/cache/provider-session-store.ts tests/unit/cache/llm-cache-store.test.ts tests/unit/cache/provider-session-store.test.ts
git commit -m "feat: add llm cache persistence primitives"
```

### Task 2: Add cache policy and cached client wrapper

**Files:**
- Create: `src/cache/llm-cache-policy.ts`
- Create: `src/cache/cached-llm-client.ts`
- Create: `src/cache/cache-metrics.ts`
- Create: `tests/unit/cache/llm-cache-policy.test.ts`
- Create: `tests/unit/cache/cached-llm-client.test.ts`
- Modify: `tests/helpers/fake-llm-adapter.ts`

**Step 1: Write the failing tests**

Add tests that prove:

- stable/work/volatile prompt layers are classified deterministically
- repeated calls in the same work scope reuse cached layers
- unrelated work scopes reuse project-stable material but not work summaries
- native session metadata is attempted first, then managed fallback is used
- cache metrics record hit/miss/resume/fallback events

Use `FakeLlmAdapter` to count avoided calls or reduced reconstructed prompt payloads.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cache/llm-cache-policy.test.ts tests/unit/cache/cached-llm-client.test.ts`
Expected: FAIL because policy/client do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- a policy object that takes explicit `CacheScope` and prompt parts
- `CachedLlmClient` wrapping `complete(prompt)` plus cache metadata/options
- fallback logic:
  - native resume when valid session exists
  - managed cache reconstruction when native resume unavailable/fails
  - full prompt path when no cache applies

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/cache/llm-cache-policy.test.ts tests/unit/cache/cached-llm-client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cache/llm-cache-policy.ts src/cache/cached-llm-client.ts src/cache/cache-metrics.ts tests/unit/cache/llm-cache-policy.test.ts tests/unit/cache/cached-llm-client.test.ts tests/helpers/fake-llm-adapter.ts
git commit -m "feat: add cached llm client"
```

### Task 3: Extend provider capabilities and CLI adapter session hooks

**Files:**
- Modify: `src/skills/providers/cli-provider.ts`
- Modify: `src/skills/providers/claude-provider.ts`
- Modify: `src/skills/providers/codex-provider.ts`
- Modify: `src/skills/providers/gemini-provider.ts`
- Modify: `src/skills/providers/aider-provider.ts`
- Modify: `src/adapters/cli-llm-adapter.ts`
- Create: `tests/unit/skills/providers/provider-capabilities.test.ts`
- Create: `tests/unit/adapters/cli-llm-adapter-cache.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:

- provider capability metadata is explicit and stable
- adapter can accept a work/session hint and persist provider session metadata when supported
- native session failure clears invalid metadata and signals fallback

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/skills/providers/provider-capabilities.test.ts tests/unit/adapters/cli-llm-adapter-cache.test.ts`
Expected: FAIL because provider capability/session APIs do not exist yet.

**Step 3: Write minimal implementation**

Extend the provider contract with explicit capability fields/methods and update `CliLlmAdapter` to:

- accept cache/session metadata for one work scope
- read/write provider session info through the new stores
- keep current behavior for providers with no native persistent session support

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/skills/providers/provider-capabilities.test.ts tests/unit/adapters/cli-llm-adapter-cache.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/skills/providers/cli-provider.ts src/skills/providers/claude-provider.ts src/skills/providers/codex-provider.ts src/skills/providers/gemini-provider.ts src/skills/providers/aider-provider.ts src/adapters/cli-llm-adapter.ts tests/unit/skills/providers/provider-capabilities.test.ts tests/unit/adapters/cli-llm-adapter-cache.test.ts
git commit -m "feat: add provider session capability hooks"
```

### Task 4: Integrate cached client into planning and issue workflows

**Files:**
- Modify: `src/cli/session.ts`
- Modify: `src/cli/dep-factory.ts`
- Modify: `src/issues/issue-triage.ts`
- Modify: `src/issues/issue-graph-builder.ts`
- Modify: `src/closure/pr-creator.ts`
- Modify: `src/cli/project-root.ts`
- Create: `tests/unit/cli/session-cache.test.ts`
- Create: `tests/unit/issues/issue-cache-isolation.test.ts`
- Create: `tests/unit/closure/pr-creator-cache.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:

- planning reuses stable project context across repeated plan/revise passes
- the old single `llm-response.json` behavior is replaced by structured cache persistence
- `issue:99` and `issue:110` do not share work history
- PR generation can reuse project-stable instructions without inheriting unrelated work context

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cli/session-cache.test.ts tests/unit/issues/issue-cache-isolation.test.ts tests/unit/closure/pr-creator-cache.test.ts`
Expected: FAIL because these call sites do not use the cache system yet.

**Step 3: Write minimal implementation**

Integrate `CachedLlmClient` into:

- planning decomposition/revision
- issue triage/graph building
- PR title/body generation

Add explicit work scopes like:

- `plan:<plan-name>`
- `issue:<issue-number>`
- `pr:<branch>`

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/cli/session-cache.test.ts tests/unit/issues/issue-cache-isolation.test.ts tests/unit/closure/pr-creator-cache.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/session.ts src/cli/dep-factory.ts src/issues/issue-triage.ts src/issues/issue-graph-builder.ts src/closure/pr-creator.ts src/cli/project-root.ts tests/unit/cli/session-cache.test.ts tests/unit/issues/issue-cache-isolation.test.ts tests/unit/closure/pr-creator-cache.test.ts
git commit -m "feat: cache planning issues and pr generation"
```

### Task 5: Integrate cache-aware work scopes into chat and Beast-facing LLM surfaces

**Files:**
- Modify: `src/chat/chat-runtime-factory.ts`
- Modify: `src/chat/conversation-engine.ts`
- Modify: `src/http/chat-server.ts`
- Modify: `src/http/chat-app.ts`
- Create: `tests/unit/chat/chat-cache.test.ts`
- Create: `tests/e2e/chat/chat-cache-resume.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:

- chat sessions persist safe work-scoped reuse across restarts
- chat work scope reuses project-stable material but not another chat session’s dynamic transcript
- native provider continuation is used when available

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/chat/chat-cache.test.ts tests/e2e/chat/chat-cache-resume.test.ts`
Expected: FAIL because chat does not yet use the generalized cache subsystem.

**Step 3: Write minimal implementation**

Integrate cache scope IDs such as `chat:<session-id>` into chat runtime creation and make chat LLM calls use `CachedLlmClient`.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/chat/chat-cache.test.ts tests/e2e/chat/chat-cache-resume.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/chat/chat-runtime-factory.ts src/chat/conversation-engine.ts src/http/chat-server.ts src/http/chat-app.ts tests/unit/chat/chat-cache.test.ts tests/e2e/chat/chat-cache-resume.test.ts
git commit -m "feat: add cache-aware chat sessions"
```

### Task 6: Integrate cache scopes into chunk execution and Martin loop

**Files:**
- Modify: `src/skills/martin-loop.ts`
- Modify: `src/skills/cli-types.ts`
- Modify: `src/skills/cli-skill-executor.ts`
- Modify: `src/session/chunk-session.ts`
- Modify: `src/session/chunk-session-store.ts`
- Create: `tests/unit/skills/martin-loop-cache.test.ts`
- Create: `tests/unit/skills/cli-skill-executor-cache.test.ts`
- Create: `tests/e2e/cli-skill-cache-isolation.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:

- one chunk/work scope can resume with its own cached/native state after restart
- another chunk or issue cannot see that state
- native session failure falls back to compacted managed state reconstruction

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/skills/martin-loop-cache.test.ts tests/unit/skills/cli-skill-executor-cache.test.ts tests/e2e/cli-skill-cache-isolation.test.ts`
Expected: FAIL because the execution stack does not expose generalized cache scopes yet.

**Step 3: Write minimal implementation**

Plumb explicit work scope IDs into Martin loop / CLI skill execution:

- `issue:<n>:chunk:<id>`
- `plan:<name>:chunk:<id>`
- `beast:<run-id>:chunk:<id>`

Use provider-native resume where possible, and managed compacted state otherwise.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/skills/martin-loop-cache.test.ts tests/unit/skills/cli-skill-executor-cache.test.ts tests/e2e/cli-skill-cache-isolation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/skills/martin-loop.ts src/skills/cli-types.ts src/skills/cli-skill-executor.ts src/session/chunk-session.ts src/session/chunk-session-store.ts tests/unit/skills/martin-loop-cache.test.ts tests/unit/skills/cli-skill-executor-cache.test.ts tests/e2e/cli-skill-cache-isolation.test.ts
git commit -m "feat: add work-scoped execution cache reuse"
```

### Task 7: Add cache lifecycle controls, metrics, and docs

**Files:**
- Modify: `src/cli/args.ts`
- Modify: `src/cli/run.ts`
- Modify: `src/cli/cleanup.ts`
- Modify: `src/index.ts`
- Modify: `docs/RAMP_UP.md`
- Create: `tests/unit/cli/cache-cleanup.test.ts`
- Create: `tests/unit/cache/cache-metrics.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:

- cache directories are cleaned by explicit cleanup flows
- metrics report hits/misses/avoided prompt tokens
- public exports expose cache primitives where appropriate

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cli/cache-cleanup.test.ts tests/unit/cache/cache-metrics.test.ts`
Expected: FAIL because cleanup/metrics/docs/export work is not wired yet.

**Step 3: Write minimal implementation**

Add:

- cleanup of `.frankenbeast/.cache/llm`
- cache metrics reporting hooks
- updated public exports if desired
- ramp-up/doc updates describing cache scopes and isolation guarantees

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/cli/cache-cleanup.test.ts tests/unit/cache/cache-metrics.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/args.ts src/cli/run.ts src/cli/cleanup.ts src/index.ts docs/RAMP_UP.md tests/unit/cli/cache-cleanup.test.ts tests/unit/cache/cache-metrics.test.ts
git commit -m "docs: document llm caching and lifecycle controls"
```

### Task 8: Run end-to-end verification

**Files:**
- Test: `tests/unit/cache/*.test.ts`
- Test: `tests/unit/cli/*.test.ts`
- Test: `tests/unit/chat/*.test.ts`
- Test: `tests/unit/issues/*.test.ts`
- Test: `tests/unit/skills/*.test.ts`
- Test: `tests/e2e/chat/chat-cache-resume.test.ts`
- Test: `tests/e2e/cli-skill-cache-isolation.test.ts`

**Step 1: Run focused suites**

Run: `npm test -- tests/unit/cache tests/unit/cli tests/unit/chat tests/unit/issues tests/unit/skills`
Expected: PASS

**Step 2: Run e2e suites for cache behavior**

Run: `npm test -- tests/e2e/chat/chat-cache-resume.test.ts tests/e2e/cli-skill-cache-isolation.test.ts`
Expected: PASS

**Step 3: Run full package verification**

Run: `npm test`
Expected: PASS

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add .
git commit -m "test: verify intelligent llm caching end to end"
```
