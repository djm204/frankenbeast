# Frankenbeast Chat Persona Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce a shared Frankenbeast chat persona across orchestrator chat surfaces so the assistant identifies as Frankenbeast, never as the underlying provider, while preserving task-specific skill and safety behavior.

**Architecture:** Update the shared system prompt in the orchestrator `PromptBuilder`, then verify it through unit tests at both the prompt-builder layer and the conversation-engine layer. Keep the change centralized so every chat surface using `ConversationEngine` inherits the persona automatically.

**Tech Stack:** TypeScript, Vitest, Hono chat app, orchestrator chat pipeline

---

### Task 1: Lock the Persona Contract in PromptBuilder Tests

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/chat/prompt-builder.test.ts`
- Reference: `packages/franken-orchestrator/src/chat/prompt-builder.ts`

**Step 1: Write the failing test**

Add a unit test that builds a prompt and asserts it contains:
- `Frankenbeast`
- a directive not to identify as the underlying model/provider
- the task-execution purpose and direct/pragmatic tone boundary

Example assertion shape:

```ts
it('includes the Frankenbeast identity and persona boundaries', () => {
  const builder = new PromptBuilder({ projectName: 'frankenbeast' });

  const prompt = builder.build([]);

  expect(prompt).toContain('You are Frankenbeast');
  expect(prompt).toContain('Do not describe yourself as Claude, Codex, or any underlying model');
  expect(prompt).toContain('accomplish the task at hand exactly to spec');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/unit/chat/prompt-builder.test.ts`

Expected: FAIL because the current prompt still describes a generic AI assistant.

**Step 3: Write minimal implementation**

Modify `packages/franken-orchestrator/src/chat/prompt-builder.ts` so the system context:
- identifies the assistant as Frankenbeast
- sets the requested tone
- forbids provider self-identification
- says persona does not override task-specific skills, workflow requirements, or safety constraints
- preserves the project-name grounding

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/unit/chat/prompt-builder.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/chat/prompt-builder.ts packages/franken-orchestrator/tests/unit/chat/prompt-builder.test.ts
git commit -m "feat: add frankenbeast chat persona"
```

### Task 2: Prove ConversationEngine Sends the Persona Prompt

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/chat/conversation-engine.test.ts`
- Reference: `packages/franken-orchestrator/src/chat/conversation-engine.ts`

**Step 1: Write the failing test**

Add a test that uses a mocked LLM, runs a reply turn such as `"who are you?"`, and asserts the prompt passed to `llm.complete()` includes the Frankenbeast identity text.

Example assertion shape:

```ts
it('sends the Frankenbeast persona prompt to the llm for reply turns', async () => {
  const llm = { complete: vi.fn().mockResolvedValue('I am Frankenbeast.') };
  const engine = new ConversationEngine({ llm, projectName: 'test' });

  await engine.processTurn('who are you?', []);

  expect(llm.complete).toHaveBeenCalledWith(expect.stringContaining('You are Frankenbeast'));
});
```

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/unit/chat/conversation-engine.test.ts`

Expected: FAIL because the current prompt does not include the Frankenbeast persona.

**Step 3: Keep implementation minimal**

If Task 1 was implemented in `PromptBuilder`, no additional production code should be needed here. Only adjust tests if the prompt wording was finalized differently.

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/unit/chat/conversation-engine.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/unit/chat/conversation-engine.test.ts
git commit -m "test: verify frankenbeast persona prompt wiring"
```

### Task 3: Reconfirm Prompt-Extraction Safety

**Files:**
- Verify: `packages/franken-orchestrator/tests/integration/chat/security.test.ts`
- Reference: `packages/franken-orchestrator/src/http/chat-app.ts`

**Step 1: Review existing coverage**

Confirm the integration tests already cover prompt extraction attempts and assert that the response does not expose the system prompt.

**Step 2: Run targeted security tests**

Run: `npm --workspace franken-orchestrator test -- tests/integration/chat/security.test.ts`

Expected: PASS

**Step 3: Tighten only if needed**

If the tests are too weak after the persona change, add a minimal assertion that responses still do not reveal prompt internals, without snapshotting the full system prompt text.

**Step 4: Re-run the targeted security tests**

Run: `npm --workspace franken-orchestrator test -- tests/integration/chat/security.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/integration/chat/security.test.ts
git commit -m "test: preserve chat prompt extraction protections"
```

### Task 4: Full Orchestrator Verification

**Files:**
- Verify only

**Step 1: Run the relevant unit and integration tests**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/chat/prompt-builder.test.ts tests/unit/chat/conversation-engine.test.ts tests/integration/chat/security.test.ts
```

Expected: PASS

**Step 2: Run the full orchestrator test suite**

Run: `npm --workspace franken-orchestrator test`

Expected: PASS

**Step 3: Run typecheck**

Run: `npm --workspace franken-orchestrator run typecheck`

Expected: PASS

**Step 4: Run build**

Run: `npm --workspace franken-orchestrator run build`

Expected: PASS

**Step 5: Commit verification-safe final state**

```bash
git status
```

Confirm only intended files changed before any branch/PR workflow.
