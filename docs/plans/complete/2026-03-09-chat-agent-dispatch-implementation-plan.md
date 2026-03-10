# Chat Agent Dispatch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform `frankenbeast chat` from a conversational-only REPL into a two-tier command center that can chat cheaply and spawn tool-using agents for real work.

**Architecture:** Conversational replies use the existing cheap chatMode LLM path with a spinner. Execution tasks use a new `ChatAgentExecutor` (implements `ITaskExecutor`) that spawns a full-permissions CLI agent via `CliLlmAdapter`. Slash commands (`/plan`, `/run`) bypass the IntentRouter and dispatch directly. Stream progress shows tool-use activity during agent execution.

**Tech Stack:** TypeScript, Node.js, vitest, existing `Spinner`, `StreamProgress`, `ICliProvider`, `CliLlmAdapter`

---

### Task 1: ADR-014 — Chat Two-Tier Dispatch Architecture

**Files:**
- Create: `docs/adr/014-chat-two-tier-dispatch.md`

**Step 1: Write the ADR**

```markdown
# ADR-014: Chat Two-Tier Dispatch Architecture

## Status
Accepted

## Context
`frankenbeast chat` was a conversational-only REPL that could answer questions but not take action. Users need it to also spawn agents for code changes, planning, and repo operations — while keeping simple chat cheap and fast.

## Decision
Implement a hybrid two-tier dispatch model within the chat REPL:

- **Tier 1 (Conversational):** Simple/technical chat uses a cheap model with `chatMode: true` (no tool permissions). A spinner shows while waiting.
- **Tier 2 (Execution):** Code requests and repo actions spawn a full-permissions CLI agent via `ChatAgentExecutor`. Lightweight tasks (code_request) run on the current branch. Heavy tasks (repo_action) require `/approve` before execution.

Slash commands (`/plan`, `/run`) bypass the IntentRouter and dispatch directly to execution. Natural language also triggers execution via the existing `IntentRouter` → `EscalationPolicy` pipeline.

Multi-agent support is optional (default: 1 agent at a time). The interface supports `maxAgents > 1` without redesign.

## Consequences
- Chat becomes a command center, not just a chatbot
- Cheap model handles most interactions (cost-efficient)
- Full-permissions agent only spawns when real work is requested
- `/approve` gate on repo actions preserves safety
- Stub executor replaced with real `ChatAgentExecutor`
```

**Step 2: Commit**

```bash
git add docs/adr/014-chat-two-tier-dispatch.md
git commit -m "docs(adr): ADR-014 chat two-tier dispatch architecture"
```

---

### Task 2: ADR-015 — Shared Spinner Abstraction

**Files:**
- Create: `docs/adr/015-shared-spinner-abstraction.md`

**Step 1: Write the ADR**

```markdown
# ADR-015: Shared Spinner Abstraction

## Status
Accepted

## Context
Multiple services need a loading spinner (chat REPL, planner, build runner). The existing `Spinner` class in `src/cli/spinner.ts` works but is not exposed as a reusable helper with consistent start/stop semantics across different async operations.

## Decision
Create a shared `withSpinner<T>(label: string, fn: () => Promise<T>): Promise<T>` helper that wraps any async operation with spinner start/stop. It:

- Starts the spinner with the given label before calling `fn`
- Stops the spinner when `fn` resolves or rejects
- Returns the result or rethrows the error
- Uses the existing `Spinner` class internally

This is used by the chat REPL for conversational replies and can be adopted by the planner and other services.

## Consequences
- Consistent spinner UX across all CLI services
- Single helper function — no new classes or abstractions
- Existing `Spinner` class unchanged; helper is a thin wrapper
```

**Step 2: Commit**

```bash
git add docs/adr/015-shared-spinner-abstraction.md
git commit -m "docs(adr): ADR-015 shared spinner abstraction"
```

---

### Task 3: Write failing test for `withSpinner` helper

**Files:**
- Create: `packages/franken-orchestrator/tests/unit/cli/spinner-helper.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/spinner-helper.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { withSpinner } from '../../../src/cli/spinner.js';

describe('withSpinner', () => {
  it('returns the result of the wrapped async function', async () => {
    const result = await withSpinner('loading', async () => 'hello', { silent: true });
    expect(result).toBe('hello');
  });

  it('rethrows errors from the wrapped function', async () => {
    await expect(
      withSpinner('loading', async () => { throw new Error('boom'); }, { silent: true }),
    ).rejects.toThrow('boom');
  });

  it('calls write with spinner frames when not silent', async () => {
    const writes: string[] = [];
    const write = (text: string) => { writes.push(text); };
    await withSpinner('test', async () => {
      // Give spinner time to render at least one frame
      await new Promise((r) => setTimeout(r, 150));
      return 42;
    }, { write });
    expect(writes.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/cli/spinner-helper.test.ts`
Expected: FAIL — `withSpinner` is not exported from `../../../src/cli/spinner.js`

---

### Task 4: Implement `withSpinner` helper

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/spinner.ts` (append after Spinner class)

**Step 1: Write minimal implementation**

Append to end of `packages/franken-orchestrator/src/cli/spinner.ts`:

```typescript
/**
 * Wraps an async operation with a spinner.
 * Starts spinner before calling fn, stops when fn resolves/rejects.
 */
export async function withSpinner<T>(
  label: string,
  fn: () => Promise<T>,
  options: SpinnerOptions = {},
): Promise<T> {
  const spinner = new Spinner(options);
  spinner.start(label);
  try {
    const result = await fn();
    spinner.stop();
    return result;
  } catch (err) {
    spinner.stop();
    throw err;
  }
}
```

**Step 2: Run test to verify it passes**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/cli/spinner-helper.test.ts`
Expected: PASS (3 tests)

**Step 3: Run all spinner tests to check nothing broke**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/cli/`
Expected: All PASS

**Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/cli/spinner.ts packages/franken-orchestrator/tests/unit/cli/spinner-helper.test.ts
git commit -m "feat(chat): add withSpinner async helper for shared spinner UX"
```

---

### Task 5: Write failing test for `ChatAgentExecutor`

**Files:**
- Create: `packages/franken-orchestrator/tests/unit/chat/chat-agent-executor.test.ts`

**Step 1: Write the failing test**

Reference existing test patterns from `tests/unit/chat/turn-runner.test.ts` and `tests/unit/adapters/cli-llm-adapter.test.ts`.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatAgentExecutor } from '../../../src/chat/chat-agent-executor.js';
import type { ExecutionResult } from '../../../src/chat/turn-runner.js';

describe('ChatAgentExecutor', () => {
  const mockComplete = vi.fn<[string], Promise<string>>();
  const mockLlm = { complete: mockComplete };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls LLM complete with user input and returns success', async () => {
    mockComplete.mockResolvedValueOnce('Created the file successfully');

    const executor = new ChatAgentExecutor({ llm: mockLlm });
    const result: ExecutionResult = await executor.execute({ userInput: 'create a hello.ts file' });

    expect(mockComplete).toHaveBeenCalledWith('create a hello.ts file');
    expect(result.status).toBe('success');
    expect(result.summary).toBe('Created the file successfully');
  });

  it('returns failed status when LLM throws', async () => {
    mockComplete.mockRejectedValueOnce(new Error('rate limited'));

    const executor = new ChatAgentExecutor({ llm: mockLlm });
    const result = await executor.execute({ userInput: 'do something' });

    expect(result.status).toBe('failed');
    expect(result.errors).toContain('rate limited');
  });

  it('calls onProgress callback when provided', async () => {
    mockComplete.mockResolvedValueOnce('Done');
    const onProgress = vi.fn();

    const executor = new ChatAgentExecutor({ llm: mockLlm, onProgress });
    await executor.execute({ userInput: 'fix bug' });

    expect(onProgress).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/chat/chat-agent-executor.test.ts`
Expected: FAIL — `ChatAgentExecutor` module not found

---

### Task 6: Implement `ChatAgentExecutor`

**Files:**
- Create: `packages/franken-orchestrator/src/chat/chat-agent-executor.ts`

**Step 1: Write minimal implementation**

```typescript
import type { ITaskExecutor, ExecutionResult } from './turn-runner.js';

export interface ChatAgentLlm {
  complete(prompt: string): Promise<string>;
}

export interface ChatAgentExecutorOptions {
  llm: ChatAgentLlm;
  onProgress?: (message: string) => void;
}

export class ChatAgentExecutor implements ITaskExecutor {
  private readonly llm: ChatAgentLlm;
  private readonly onProgress: ((message: string) => void) | undefined;

  constructor(opts: ChatAgentExecutorOptions) {
    this.llm = opts.llm;
    this.onProgress = opts.onProgress;
  }

  async execute(input: { userInput: string }): Promise<ExecutionResult> {
    this.onProgress?.('Spawning agent...');

    try {
      const response = await this.llm.complete(input.userInput);
      return {
        status: 'success',
        summary: response,
        filesChanged: [],
        testsRun: 0,
        errors: [],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'failed',
        summary: `Agent failed: ${message}`,
        filesChanged: [],
        testsRun: 0,
        errors: [message],
      };
    }
  }
}
```

**Step 2: Run test to verify it passes**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/chat/chat-agent-executor.test.ts`
Expected: PASS (3 tests)

**Step 3: Commit**

```bash
git add packages/franken-orchestrator/src/chat/chat-agent-executor.ts packages/franken-orchestrator/tests/unit/chat/chat-agent-executor.test.ts
git commit -m "feat(chat): add ChatAgentExecutor implementing ITaskExecutor"
```

---

### Task 7: Write failing test for spinner in ChatRepl

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/cli/chat-repl.test.ts`

**Step 1: Write the failing test**

Add this test to the existing `describe('ChatRepl')` block in `tests/unit/cli/chat-repl.test.ts`:

```typescript
  it('shows spinner while waiting for LLM reply', async () => {
    // Make processTurn take some time so spinner renders
    const slowProcessTurn = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return {
        outcome: { kind: 'reply', content: 'Hi there!', modelTier: 'cheap' },
        tier: 'cheap',
        newMessages: [
          { role: 'user', content: 'hey', timestamp: new Date().toISOString() },
          { role: 'assistant', content: 'Hi there!', timestamp: new Date().toISOString(), modelTier: 'cheap' },
        ],
      };
    });

    const { io, outputs, pushInput } = mockChatIO();
    pushInput('hey');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: slowProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    // Spinner writes to io.print — check that response still appears
    expect(outputs.some(o => o.includes('Hi there!'))).toBe(true);
  });
```

**Step 2: Run test to verify it fails (or passes — it may pass if spinner is transparent)**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/cli/chat-repl.test.ts`
Expected: May PASS (the test validates response still appears with spinner). This test is a guard rail — proceed to wiring.

---

### Task 8: Wire spinner into ChatRepl for conversational replies

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/chat-repl.ts:1-7` (add import)
- Modify: `packages/franken-orchestrator/src/cli/chat-repl.ts:90-98` (wrap processTurn with spinner)

**Step 1: Add import**

At the top of `chat-repl.ts`, add the `withSpinner` import alongside existing imports:

```typescript
import { withSpinner } from './spinner.js';
```

**Step 2: Wrap the LLM call with spinner**

In the `processTurn` method (around lines 90-98), wrap the `engine.processTurn()` call:

Replace:
```typescript
  private async processTurn(input: string): Promise<void> {
    let result: TurnResult;
    try {
      result = await this.engine.processTurn(input, this.transcript);
    } catch (err) {
```

With:
```typescript
  private async processTurn(input: string): Promise<void> {
    let result: TurnResult;
    try {
      result = await withSpinner('thinking', () => this.engine.processTurn(input, this.transcript), { silent: !process.stderr.isTTY });
    } catch (err) {
```

**Step 3: Run tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/cli/chat-repl.test.ts`
Expected: All PASS

**Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/cli/chat-repl.ts packages/franken-orchestrator/tests/unit/cli/chat-repl.test.ts
git commit -m "feat(chat): add spinner to chat REPL during LLM replies"
```

---

### Task 9: Write failing tests for slash command dispatch (`/run`, `/plan`)

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/cli/chat-repl.test.ts`

**Step 1: Write the failing tests**

Add these tests to the existing `describe('ChatRepl')` block:

```typescript
  it('dispatches /run <description> to TurnRunner as execute outcome', async () => {
    const { io, pushInput } = mockChatIO();
    pushInput('/run create a hello world file');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(mockRunTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'execute',
        taskDescription: 'create a hello world file',
      }),
    );
    // Should NOT go through the engine
    const engineCalls = mockProcessTurn.mock.calls.filter(
      ([input]: [string]) => input.startsWith('/run'),
    );
    expect(engineCalls).toHaveLength(0);
  });

  it('dispatches /plan <description> to TurnRunner as plan outcome', async () => {
    const { io, outputs, pushInput } = mockChatIO();
    pushInput('/plan build a react dashboard');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(mockRunTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'plan',
        planSummary: 'build a react dashboard',
      }),
    );
  });

  it('shows error when /run is used without a description', async () => {
    const { io, outputs, pushInput } = mockChatIO();
    pushInput('/run');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(outputs.some(o => o.includes('description'))).toBe(true);
    expect(mockRunTurn).not.toHaveBeenCalled();
  });
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/cli/chat-repl.test.ts`
Expected: FAIL — `/run` and `/plan` currently just print help text, they don't dispatch to TurnRunner

---

### Task 10: Implement slash command dispatch

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/chat-repl.ts:155-184` (handleSlashCommand method)

**Step 1: Update handleSlashCommand**

Replace the `handleSlashCommand` method in `chat-repl.ts`:

```typescript
  private async handleSlashCommand(cmd: string, raw: string): Promise<void> {
    const description = raw.slice(cmd.length).trim();

    switch (cmd) {
      case '/plan': {
        if (!description) {
          this.io.print(`${ANSI.dim}Usage: /plan <description>${ANSI.reset}`);
          return;
        }
        const outcome = { kind: 'plan' as const, planSummary: description, chunkCount: 0 };
        const runResult = await this.turnRunner.run(outcome);
        this.io.print(`${ANSI.blue}plan:${ANSI.reset} ${runResult.summary}`);
        break;
      }
      case '/run': {
        if (!description) {
          this.io.print(`${ANSI.dim}Usage: /run <description>${ANSI.reset}`);
          return;
        }
        const outcome = { kind: 'execute' as const, taskDescription: description, approvalRequired: false };
        await this.handleExecute({
          outcome,
          tier: 'premium_execution' as const,
          newMessages: [{ role: 'user' as const, content: raw, timestamp: new Date().toISOString() }],
        });
        break;
      }
      case '/status':
        this.io.print(
          `${ANSI.dim}project=${this.projectId} messages=${this.transcript.length}${ANSI.reset}`,
        );
        break;
      case '/diff':
        this.io.print(`${ANSI.dim}No diff available.${ANSI.reset}`);
        break;
      case '/approve':
        if (this.pendingApproval) {
          this.pendingApproval = false;
          this.io.print(`${ANSI.green}Approved.${ANSI.reset}`);
        } else {
          this.io.print(`${ANSI.dim}Nothing pending.${ANSI.reset}`);
        }
        break;
      case '/session':
        this.io.print(
          `${ANSI.dim}project=${this.projectId} messages=${this.transcript.length}${ANSI.reset}`,
        );
        break;
    }
  }
```

**Step 2: Run tests to verify they pass**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/cli/chat-repl.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/franken-orchestrator/src/cli/chat-repl.ts packages/franken-orchestrator/tests/unit/cli/chat-repl.test.ts
git commit -m "feat(chat): wire /run and /plan slash commands to TurnRunner dispatch"
```

---

### Task 11: Wire ChatAgentExecutor into run.ts (replace stub)

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/run.ts:122-151` (chat subcommand setup)

**Step 1: Update chat subcommand wiring**

In `run.ts`, replace the stub executor with `ChatAgentExecutor`. The chat subcommand section (around lines 122-151) becomes:

Add import at top of file:
```typescript
import { ChatAgentExecutor } from '../chat/chat-agent-executor.js';
```

Replace the chat subcommand block — specifically the executor and adapter setup. The key changes:

1. Create a **second** `CliLlmAdapter` for execution (no `chatMode`, project root working dir)
2. Replace the stub executor with `ChatAgentExecutor` using the execution adapter

```typescript
  if (args.subcommand === 'chat') {
    const chatStoreDir = join(paths.frankenbeastDir, 'chat');
    const sessionStore = new FileSessionStore(chatStoreDir);
    const projectId = paths.root.split('/').pop() ?? 'unknown';
    const registry = createDefaultRegistry();
    const resolvedProvider = registry.get(args.provider);

    const chatDepOpts = {
      paths,
      baseBranch: 'main',
      budget: args.budget,
      provider: args.provider,
      providers: args.providers ?? config.providers.fallbackChain,
      providersConfig: config.providers.overrides,
      noPr: true,
      verbose: args.verbose,
      reset: false,
      adapterWorkingDir: tmpdir(),
      adapterModel: resolvedProvider.chatModel,
      chatMode: true,
    };
    const { cliLlmAdapter, finalize } = await createCliDeps(chatDepOpts);
    const chatLlm = new AdapterLlmClient(cliLlmAdapter);

    // Execution adapter: full permissions, project root, no chatMode
    const override = config.providers.overrides?.[args.provider];
    const execAdapter = new CliLlmAdapter(resolvedProvider, {
      workingDir: paths.root,
      ...(override?.command ? { commandOverride: override.command } : {}),
    });
    const execLlm = new AdapterLlmClient(execAdapter);

    const engine = new ConversationEngine({ llm: chatLlm, projectName: projectId });
    const executor = new ChatAgentExecutor({ llm: execLlm });
    const turnRunner = new TurnRunner(executor);
    const repl = new ChatRepl({ engine, turnRunner, projectId, sessionStore, verbose: args.verbose });
    await repl.start();
    await finalize();
    return;
  }
```

Also add `CliLlmAdapter` and `AdapterLlmClient` to imports if not already present (check — `AdapterLlmClient` is likely already imported, `CliLlmAdapter` may need adding):

```typescript
import { CliLlmAdapter } from '../adapters/cli-llm-adapter.js';
```

**Step 2: Type-check**

Run: `cd packages/franken-orchestrator && npx tsc --noEmit`
Expected: No errors

**Step 3: Run chat-repl tests**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/cli/chat-repl.test.ts`
Expected: All PASS (tests use mocks, not real wiring)

**Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/cli/run.ts
git commit -m "feat(chat): replace stub executor with ChatAgentExecutor in chat subcommand"
```

---

### Task 12: Write failing test for stream progress in handleExecute

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/cli/chat-repl.test.ts`

**Step 1: Write the failing test**

Add to existing `describe('ChatRepl')`:

```typescript
  it('displays execution summary after agent completes', async () => {
    mockProcessTurn.mockResolvedValueOnce({
      outcome: { kind: 'execute', taskDescription: 'Create hello.ts', approvalRequired: false },
      tier: 'premium_execution',
      newMessages: [{ role: 'user', content: 'create hello.ts', timestamp: new Date().toISOString() }],
    });
    mockRunTurn.mockResolvedValueOnce({
      status: 'completed',
      summary: 'Created hello.ts with Hello World content',
      events: [],
    });

    const { io, outputs, pushInput } = mockChatIO();
    pushInput('create hello.ts');
    pushInput('/quit');

    const repl = new ChatRepl({
      engine: { processTurn: mockProcessTurn } as any,
      turnRunner: { run: mockRunTurn } as any,
      projectId: 'test',
      io,
    });
    await repl.start();

    expect(outputs.some(o => o.includes('Created hello.ts with Hello World content'))).toBe(true);
  });
```

**Step 2: Run test — this should already PASS with existing handleExecute**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/cli/chat-repl.test.ts`
Expected: PASS (handleExecute already prints `runResult.summary`)

**Step 3: Commit**

```bash
git add packages/franken-orchestrator/tests/unit/cli/chat-repl.test.ts
git commit -m "test(chat): add execution summary display test for ChatRepl"
```

---

### Task 13: Build and full test suite

**Files:** None (verification only)

**Step 1: Type-check**

Run: `cd packages/franken-orchestrator && npx tsc --noEmit`
Expected: No errors

**Step 2: Build**

Run: `cd packages/franken-orchestrator && npx tsc`
Expected: Clean compile

**Step 3: Run full test suite**

Run: `cd packages/franken-orchestrator && npx vitest run`
Expected: All tests PASS (1246+ tests)

**Step 4: Run monorepo tests**

Run: `npm test`
Expected: All packages PASS

---

### Task 14: Final commit and summary

**Step 1: Verify git status**

Run: `git status`
Expected: Clean working tree (all changes committed in prior tasks)

**Step 2: Update ARCHITECTURE.md if needed**

Check `docs/ARCHITECTURE.md` — if the chat REPL section exists, update it to mention agent dispatch capability. If not, skip.

**Step 3: Update RAMP_UP.md**

Update `docs/RAMP_UP.md` to mention that `frankenbeast chat` can now spawn agents via `/run` and `/plan`, and supports both conversational and execution modes.
