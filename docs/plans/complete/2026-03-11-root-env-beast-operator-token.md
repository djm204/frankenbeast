# Root Env Beast Operator Token Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the chat server read the Beast operator token from root `.env` before falling back to `packages/franken-web/.env.local`.

**Architecture:** Keep the existing targeted token discovery helper in the chat-server CLI path, but extend it with root-first file lookup. Preserve process environment precedence and package-local fallback so existing local setups continue to work.

**Tech Stack:** TypeScript, Vitest, Node.js fs/path utilities

---

### Task 1: Lock in root-first precedence with tests

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/cli/run.test.ts`

**Step 1: Write the failing test**

Add a test that creates both a root `.env` and `packages/franken-web/.env.local`, runs `main()` in `chat-server` mode, and expects `startChatServer()` to receive the root token.

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/unit/cli/run.test.ts`
Expected: FAIL because the current loader prefers the package-local file path.

**Step 3: Add fallback coverage**

Keep or adapt the existing package-local file test so fallback behavior remains covered after the precedence change.

**Step 4: Run test to verify coverage shape**

Run: `npm --workspace franken-orchestrator test -- tests/unit/cli/run.test.ts`
Expected: root-precedence test still red until implementation lands.

### Task 2: Implement root-first token discovery

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/run.ts`

**Step 1: Update the loader**

Extend the Beast operator token discovery helper to:
- check process env first
- read repository root `.env`
- fall back to `packages/franken-web/.env.local`

**Step 2: Keep parsing narrow**

Reuse the existing simple `KEY=value` parsing for:
- `FRANKENBEAST_BEAST_OPERATOR_TOKEN`
- `VITE_BEAST_OPERATOR_TOKEN`

**Step 3: Run the targeted test**

Run: `npm --workspace franken-orchestrator test -- tests/unit/cli/run.test.ts`
Expected: PASS

### Task 3: Update docs for shared local config

**Files:**
- Modify: `.env.example`
- Modify: `packages/franken-web/README.md`

**Step 1: Document the preferred location**

Add the Beast operator token to root `.env.example` and describe root `.env` as the shared local source of truth.

**Step 2: Document the fallback**

Adjust the web README to explain that `packages/franken-web/.env.local` is supported as a fallback, but root `.env` is preferred for shared local development.

**Step 3: Verify docs and package health**

Run:
- `npm --workspace franken-orchestrator test`
- `npm --workspace franken-orchestrator run typecheck`
- `npm --workspace @frankenbeast/web test`
- `npm --workspace @frankenbeast/web run typecheck`

Expected: all pass.
