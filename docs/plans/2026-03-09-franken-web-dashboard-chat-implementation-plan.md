# Frankenbeast Dashboard Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert `franken-web` into a routed Frankenbeast dashboard shell whose only live module is a secure, WebSocket-streamed chat UI that acts as a wrapper around the same runtime semantics as `frankenbeast chat`.

**Architecture:** Keep `ConversationEngine`, `TurnRunner`, and session state as the shared backend core in `franken-orchestrator`, explicitly preserve the current REPL continuation semantics, add a secure WebSocket transport for the web surface, then replace the current `franken-web` CRUD/SSE client with a dashboard shell and socket-driven chat page. The web layer is a transport/UI adapter over the REPL chat runtime, not a separate chat stack. Style the shell from Frankenbeast’s existing asset palette and CLI banner cues, and prove desktop/mobile behavior with tests before polishing. Build the work test-first so transport, security, parity, and UI states are proven before implementation expands.

**Tech Stack:** React 18, Vite, Vitest, Testing Library, Hono, Zod, TypeScript

---

### Task 1: Define WebSocket chat contracts and security boundaries

**Files:**
- Create: `packages/franken-orchestrator/src/http/ws-chat-types.ts`
- Create: `packages/franken-orchestrator/tests/unit/http/ws-chat-types.test.ts`
- Modify: `packages/franken-orchestrator/src/http/chat-app.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  ClientEventSchema,
  ServerEventSchema,
} from '../../../src/http/ws-chat-types.js';

describe('ws chat contracts', () => {
  it('accepts a valid message.send event and rejects unknown fields', () => {
    expect(() =>
      ClientEventSchema.parse({
        type: 'message.send',
        requestId: 'req-1',
        sessionId: 'sess-1',
        content: 'Fix the failing tests',
      }),
    ).not.toThrow();

    expect(() =>
      ClientEventSchema.parse({
        type: 'message.send',
        requestId: 'req-1',
        sessionId: 'sess-1',
        content: 'Fix the failing tests',
        injected: true,
      }),
    ).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/unit/http/ws-chat-types.test.ts`
Expected: FAIL because `ws-chat-types.ts` and the schemas do not exist yet.

**Step 3: Write minimal implementation**

```ts
import { z } from 'zod';

export const ClientEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message.send'),
    requestId: z.string().min(1),
    sessionId: z.string().min(1),
    content: z.string().min(1).max(16_384),
  }).strict(),
]);

export const ServerEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session.ready'),
    sessionId: z.string().min(1),
  }).strict(),
]);
```

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/unit/http/ws-chat-types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/http/ws-chat-types.ts packages/franken-orchestrator/tests/unit/http/ws-chat-types.test.ts packages/franken-orchestrator/src/http/chat-app.ts
git commit -m "test: define websocket chat contracts"
```

### Task 2: Add secure WebSocket handshake, origin checks, and session binding

**Files:**
- Create: `packages/franken-orchestrator/src/http/ws-chat-auth.ts`
- Create: `packages/franken-orchestrator/tests/integration/chat/ws-chat-auth.test.ts`
- Modify: `packages/franken-orchestrator/src/http/chat-app.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

describe('websocket chat auth', () => {
  it('rejects a connection when the Origin header is not allowlisted', async () => {
    const result = await connectChatSocket({
      origin: 'https://evil.example',
      token: 'valid-token',
    });

    expect(result.status).toBe(403);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/integration/chat/ws-chat-auth.test.ts`
Expected: FAIL because the WebSocket auth layer does not exist yet.

**Step 3: Write minimal implementation**

```ts
export function verifyChatSocketRequest(input: {
  origin: string | null;
  token: string | null;
  allowedOrigins: string[];
}) {
  if (!input.origin || !input.allowedOrigins.includes(input.origin)) {
    return { ok: false as const, status: 403 };
  }
  if (!input.token) {
    return { ok: false as const, status: 401 };
  }
  return { ok: true as const };
}
```

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/integration/chat/ws-chat-auth.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/http/ws-chat-auth.ts packages/franken-orchestrator/tests/integration/chat/ws-chat-auth.test.ts packages/franken-orchestrator/src/http/chat-app.ts
git commit -m "feat: secure websocket chat handshake"
```

### Task 3: Extract any REPL-specific runtime behavior needed for web parity

**Files:**
- Create: `packages/franken-orchestrator/tests/unit/chat/runtime-parity.test.ts`
- Modify: `packages/franken-orchestrator/src/chat/conversation-engine.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Modify: `packages/franken-orchestrator/src/cli/chat-repl.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

describe('chat runtime parity', () => {
  it('preserves CLI continuation semantics through shared runtime configuration', async () => {
    const replTurn2 = await runSharedRuntime({
      continuation: true,
      history: [{ role: 'user', content: 'first', timestamp: '2026-03-09T00:00:00Z' }],
      input: 'second',
    });

    const webTurn2 = await runSharedRuntime({
      continuation: true,
      history: [{ role: 'user', content: 'first', timestamp: '2026-03-09T00:00:00Z' }],
      input: 'second',
    });

    expect(webTurn2.outcome).toEqual(replTurn2.outcome);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/unit/chat/runtime-parity.test.ts`
Expected: FAIL until continuation and other runtime assumptions are surfaced cleanly enough to be reused by the WebSocket transport.

**Step 3: Write minimal implementation**

```ts
// Move runtime-affecting chat options behind shared config rather than REPL-only wiring.
const engine = new ConversationEngine({
  llm,
  projectName,
  sessionContinuation: options.sessionContinuation,
});
```

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/unit/chat/runtime-parity.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/unit/chat/runtime-parity.test.ts packages/franken-orchestrator/src/chat/conversation-engine.ts packages/franken-orchestrator/src/cli/run.ts packages/franken-orchestrator/src/cli/chat-repl.ts
git commit -m "refactor: expose shared chat runtime parity config"
```

### Task 4: Stream shared turn lifecycle over WebSocket

**Files:**
- Create: `packages/franken-orchestrator/src/http/ws-chat-server.ts`
- Create: `packages/franken-orchestrator/tests/integration/chat/ws-chat-server.test.ts`
- Modify: `packages/franken-orchestrator/src/chat/turn-runner.ts`
- Modify: `packages/franken-orchestrator/src/chat/conversation-engine.ts`
- Modify: `packages/franken-orchestrator/src/http/chat-app.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

describe('ws chat server', () => {
  it('emits typing, delta, and complete events for a reply turn', async () => {
    const events = await runSocketTurn('Explain the routing logic');

    expect(events.map((event) => event.type)).toContain('assistant.typing.start');
    expect(events.map((event) => event.type)).toContain('assistant.message.delta');
    expect(events.map((event) => event.type)).toContain('assistant.message.complete');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/integration/chat/ws-chat-server.test.ts`
Expected: FAIL because the WebSocket server and streamed event mapping do not exist.

**Step 3: Write minimal implementation**

```ts
// Emit lifecycle events around the existing shared turn processing.
socket.send({ type: 'assistant.typing.start', sessionId });
for (const chunk of chunkText(reply.content)) {
  socket.send({ type: 'assistant.message.delta', sessionId, chunk });
}
socket.send({ type: 'assistant.message.complete', sessionId, content: reply.content });
```

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/integration/chat/ws-chat-server.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/http/ws-chat-server.ts packages/franken-orchestrator/tests/integration/chat/ws-chat-server.test.ts packages/franken-orchestrator/src/chat/turn-runner.ts packages/franken-orchestrator/src/chat/conversation-engine.ts packages/franken-orchestrator/src/http/chat-app.ts
git commit -m "feat: stream chat turns over websocket"
```

### Task 5: Prove WebSocket chat matches REPL turn behavior 1:1

**Files:**
- Create: `packages/franken-orchestrator/tests/integration/chat/ws-chat-repl-parity.test.ts`
- Modify: `packages/franken-orchestrator/src/http/ws-chat-server.ts`
- Modify: `packages/franken-orchestrator/src/cli/chat-repl.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

describe('ws chat repl parity', () => {
  it('produces the same reply/plan/execute outcomes as the REPL runtime for the same turns', async () => {
    const repl = await runReplTurnSequence(['explain this file', '/plan refactor auth', '/run fix lint']);
    const web = await runSocketTurnSequence(['explain this file', '/plan refactor auth', '/run fix lint']);

    expect(web.outcomes).toEqual(repl.outcomes);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/integration/chat/ws-chat-repl-parity.test.ts`
Expected: FAIL until the WebSocket path is wired through the same runtime seams as the REPL.

**Step 3: Write minimal implementation**

```ts
// Route socket messages into the same shared turn handlers the REPL depends on.
const result = await sharedChatRuntime.processTurn(input, transcript);
```

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/integration/chat/ws-chat-repl-parity.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/integration/chat/ws-chat-repl-parity.test.ts packages/franken-orchestrator/src/http/ws-chat-server.ts packages/franken-orchestrator/src/cli/chat-repl.ts
git commit -m "test: verify websocket chat matches repl semantics"
```

### Task 6: Enforce injection scanning, payload limits, and unauthorized-session rejection on the socket path

**Files:**
- Create: `packages/franken-orchestrator/tests/integration/chat/ws-chat-security.test.ts`
- Modify: `packages/franken-orchestrator/src/http/ws-chat-server.ts`
- Modify: `packages/franken-orchestrator/src/http/ws-chat-auth.ts`
- Modify: `packages/franken-orchestrator/src/http/ws-chat-types.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

describe('ws chat security', () => {
  it('rejects oversized payloads and cross-session message attempts', async () => {
    await expect(sendSocketEvent({ type: 'message.send', sessionId: 'other-session', content: 'x'.repeat(20_000) }))
      .rejects.toThrow(/invalid/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/integration/chat/ws-chat-security.test.ts`
Expected: FAIL because the socket security rules are not enforced yet.

**Step 3: Write minimal implementation**

```ts
if (event.sessionId !== boundSessionId) {
  throw new Error('invalid session binding');
}

if (event.type === 'message.send') {
  const firewallResult = await firewall.runPipeline(event.content);
  if (firewallResult.blocked) {
    socket.send({ type: 'turn.error', code: 'PROMPT_INJECTION_BLOCKED' });
    return;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/integration/chat/ws-chat-security.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/integration/chat/ws-chat-security.test.ts packages/franken-orchestrator/src/http/ws-chat-server.ts packages/franken-orchestrator/src/http/ws-chat-auth.ts packages/franken-orchestrator/src/http/ws-chat-types.ts
git commit -m "test: harden websocket chat security"
```

### Task 7: Replace the web CRUD/SSE client with a WebSocket session hook

**Files:**
- Create: `packages/franken-web/src/lib/chat-socket.ts`
- Create: `packages/franken-web/tests/lib/chat-socket.test.ts`
- Modify: `packages/franken-web/src/hooks/use-chat-session.ts`
- Modify: `packages/franken-web/tests/hooks/use-chat-session.test.ts`
- Modify: `packages/franken-web/src/lib/api.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

describe('useChatSession', () => {
  it('tracks optimistic send, delivered receipt, and streamed assistant content', async () => {
    const session = renderChatHook();

    await session.send('Fix the build');
    pushServerEvent({ type: 'message.delivered', clientMessageId: 'm-1' });
    pushServerEvent({ type: 'assistant.message.delta', messageId: 'a-1', chunk: 'Working' });
    pushServerEvent({ type: 'assistant.message.complete', messageId: 'a-1', content: 'Working on it' });

    expect(session.messages[0]?.receipt).toBe('delivered');
    expect(session.messages[1]?.content).toBe('Working on it');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm --workspace @frankenbeast/web test -- tests/hooks/use-chat-session.test.ts`
Expected: FAIL because the hook still uses fetch plus EventSource and has no receipt/stream model.

**Step 3: Write minimal implementation**

```ts
const [messages, setMessages] = useState<ChatMessage[]>([]);
const socket = new ChatSocket(baseUrl);

socket.on('message.delivered', ({ clientMessageId }) => {
  setMessages((prev) => updateReceipt(prev, clientMessageId, 'delivered'));
});

socket.on('assistant.message.delta', ({ messageId, chunk }) => {
  setMessages((prev) => appendAssistantChunk(prev, messageId, chunk));
});
```

**Step 4: Run test to verify it passes**

Run: `npm --workspace @frankenbeast/web test -- tests/hooks/use-chat-session.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-web/src/lib/chat-socket.ts packages/franken-web/tests/lib/chat-socket.test.ts packages/franken-web/src/hooks/use-chat-session.ts packages/franken-web/tests/hooks/use-chat-session.test.ts packages/franken-web/src/lib/api.ts
git commit -m "feat(web): move chat session to websocket transport"
```

### Task 8: Build the routed dashboard shell with Frankenbeast version branding

**Files:**
- Create: `packages/franken-web/src/components/dashboard-shell.tsx`
- Create: `packages/franken-web/src/components/sidebar-nav.tsx`
- Create: `packages/franken-web/src/components/topbar.tsx`
- Create: `packages/franken-web/src/components/placeholder-page.tsx`
- Create: `packages/franken-web/tests/components/dashboard-shell.test.tsx`
- Create: `packages/franken-web/tests/components/dashboard-shell.responsive.test.tsx`
- Create: `packages/franken-web/src/lib/branding.ts`
- Modify: `packages/franken-web/src/app.tsx`
- Modify: `packages/franken-web/src/styles/app.css`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/app.js';

describe('dashboard shell', () => {
  it('renders Frankenbeast branding, the root version, and upcoming routes', () => {
    render(<App />);

    expect(screen.getByText(/Frankenbeast/i)).toBeDefined();
    expect(screen.getByText(/v0\\.9\\.0/i)).toBeDefined();
    expect(screen.getByText('Chat')).toBeDefined();
    expect(screen.getByText('Analytics')).toBeDefined();
  });

  it('uses the Frankenbeast brand treatment instead of generic neutral styling', () => {
    render(<App />);

    expect(document.documentElement.style.getPropertyValue('--color-acid')).not.toBe('');
  });

  it('collapses the sidebar into a mobile-safe navigation affordance', () => {
    window.innerWidth = 390;
    render(<App />);

    expect(screen.getByRole('button', { name: /open navigation/i })).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm --workspace @frankenbeast/web test -- tests/components/dashboard-shell.test.tsx`
Expected: FAIL because the app is still a bare chat shell with no dashboard router or version branding.

**Step 3: Write minimal implementation**

```tsx
export function DashboardShell() {
  return (
    <div className="dashboard-shell">
      <aside>
        <h1>Frankenbeast</h1>
        <p>v0.9.0</p>
        <nav>{/* Chat active, others upcoming */}</nav>
      </aside>
      <div className="dashboard-shell__main">{/* routed content */}</div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm --workspace @frankenbeast/web test -- tests/components/dashboard-shell.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-web/src/components/dashboard-shell.tsx packages/franken-web/src/components/sidebar-nav.tsx packages/franken-web/src/components/topbar.tsx packages/franken-web/src/components/placeholder-page.tsx packages/franken-web/tests/components/dashboard-shell.test.tsx packages/franken-web/tests/components/dashboard-shell.responsive.test.tsx packages/franken-web/src/lib/branding.ts packages/franken-web/src/app.tsx packages/franken-web/src/styles/app.css
git commit -m "feat(web): add frankenbeast dashboard shell"
```

### Task 9: Rebuild the chat page as a responsive operator workspace with transcript, composer, activity rail, approvals, and receipts

**Files:**
- Create: `packages/franken-web/src/pages/chat-page.tsx`
- Create: `packages/franken-web/src/components/chat-transcript.tsx`
- Create: `packages/franken-web/src/components/chat-activity-rail.tsx`
- Create: `packages/franken-web/src/components/chat-composer.tsx`
- Create: `packages/franken-web/tests/components/chat-page.test.tsx`
- Create: `packages/franken-web/tests/components/chat-page.responsive.test.tsx`
- Modify: `packages/franken-web/src/components/approval-card.tsx`
- Modify: `packages/franken-web/src/components/cost-badge.tsx`
- Modify: `packages/franken-web/src/components/chat-shell.tsx`
- Modify: `packages/franken-web/src/components/transcript-pane.tsx`
- Modify: `packages/franken-web/src/components/activity-pane.tsx`
- Modify: `packages/franken-web/src/components/composer.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatPage } from '../../src/pages/chat-page.js';

describe('ChatPage', () => {
  it('renders streamed messages, typing state, receipts, and activity panels', () => {
    render(<ChatPage />);

    expect(screen.getByText(/Agent workspace/i)).toBeDefined();
    expect(screen.getByText(/typing/i)).toBeDefined();
    expect(screen.getByText(/delivered/i)).toBeDefined();
    expect(screen.getByText(/Activity/i)).toBeDefined();
  });

  it('remains usable on mobile with stacked panels and a pinned composer', () => {
    window.innerWidth = 390;
    render(<ChatPage />);

    expect(screen.getByRole('textbox')).toBeDefined();
    expect(screen.getByText(/Activity/i)).toBeVisible();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm --workspace @frankenbeast/web test -- tests/components/chat-page.test.tsx`
Expected: FAIL because the current chat UI has no dashboard workspace layout or receipt/typing states.

**Step 3: Write minimal implementation**

```tsx
export function ChatPage() {
  return (
    <section className="chat-page">
      <header>
        <h2>Agent workspace</h2>
      </header>
      <ChatTranscript />
      <ChatComposer />
      <ChatActivityRail />
    </section>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm --workspace @frankenbeast/web test -- tests/components/chat-page.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-web/src/pages/chat-page.tsx packages/franken-web/src/components/chat-transcript.tsx packages/franken-web/src/components/chat-activity-rail.tsx packages/franken-web/src/components/chat-composer.tsx packages/franken-web/tests/components/chat-page.test.tsx packages/franken-web/tests/components/chat-page.responsive.test.tsx packages/franken-web/src/components/approval-card.tsx packages/franken-web/src/components/cost-badge.tsx packages/franken-web/src/components/chat-shell.tsx packages/franken-web/src/components/transcript-pane.tsx packages/franken-web/src/components/activity-pane.tsx packages/franken-web/src/components/composer.tsx
git commit -m "feat(web): redesign chat page as dashboard workspace"
```

### Task 10: Wire end-to-end session resume, approvals, and read receipts across web and orchestrator

**Files:**
- Create: `packages/franken-orchestrator/tests/e2e/chat/web-dashboard-chat.e2e.test.ts`
- Create: `packages/franken-web/tests/components/chat-session-flow.test.tsx`
- Modify: `packages/franken-orchestrator/src/chat/session-store.ts`
- Modify: `packages/franken-orchestrator/src/http/ws-chat-server.ts`
- Modify: `packages/franken-web/src/hooks/use-chat-session.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

describe('dashboard chat flow', () => {
  it('resumes a session, restores transcript state, and preserves approval state after reconnect', async () => {
    const result = await runReconnectScenario();

    expect(result.resumed).toBe(true);
    expect(result.pendingApproval).toBe(true);
    expect(result.messages.at(-1)?.receipt).toBe('read');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/e2e/chat/web-dashboard-chat.e2e.test.ts`
Expected: FAIL because the socket-based resume and receipt state are not fully wired yet.

**Step 3: Write minimal implementation**

```ts
// Persist session receipt and approval state, then replay it on session.resume.
session.readReceipts[messageId] = 'read';
session.pendingApproval = currentApproval ?? null;
sessionStore.save(session);
```

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/e2e/chat/web-dashboard-chat.e2e.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/e2e/chat/web-dashboard-chat.e2e.test.ts packages/franken-web/tests/components/chat-session-flow.test.tsx packages/franken-orchestrator/src/chat/session-store.ts packages/franken-orchestrator/src/http/ws-chat-server.ts packages/franken-web/src/hooks/use-chat-session.ts
git commit -m "feat: finish websocket dashboard chat session flow"
```

### Task 9: Run full verification and update docs if commands or setup changed

**Files:**
- Modify: `packages/franken-web/README.md`
- Modify: `packages/franken-orchestrator/README.md`
- Modify: `docs/guides/quickstart.md`

**Step 1: Write the failing test**

```md
No new test file is needed here. This task exists only after all earlier tests are green.
```

**Step 2: Run verification commands**

Run: `npm --workspace franken-orchestrator typecheck`
Expected: PASS

Run: `npm --workspace franken-orchestrator test`
Expected: PASS

Run: `npm --workspace @frankenbeast/web typecheck`
Expected: PASS

Run: `npm --workspace @frankenbeast/web test`
Expected: PASS

Run: `npm run build`
Expected: PASS

**Step 3: Write minimal implementation**

```md
Update any setup or runtime docs only if the WebSocket transport, dev startup flow, or environment variables changed during implementation.
```

**Step 4: Re-run the affected verification commands**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-web/README.md packages/franken-orchestrator/README.md docs/guides/quickstart.md
git commit -m "docs: update dashboard chat setup and verification"
```

## Execution Notes

- Prefer adding new WebSocket-specific files rather than overloading the old SSE code paths.
- Keep the current HTTP chat routes only as compatibility/bootstrap helpers until the WebSocket flow is proven.
- Do not expose raw stack traces or unvalidated event payloads to the browser.
- Treat the root Frankenbeast version from `package.json` as the source of truth for dashboard branding.
- Pull colors and identity from `assets/img/frankenbeast-github-logo.png`, `assets/img/frankenbeast-github-logo-478x72.png`, and the green CLI banner in `packages/franken-orchestrator/src/logging/beast-logger.ts`.
- Validate both desktop and mobile layout behavior with tests, not just manual resizing.
- Respect the current CLI chat changes in `conversation-engine.ts`, `chat-repl.ts`, `run.ts`, and `spinner.ts`; the web layer should reuse runtime behavior and must not fork turn semantics from the REPL.
- Treat transport-only affordances such as typing indicators, receipts, and connection state as additive UI behavior only; all turn outcomes must stay aligned with `frankenbeast chat`.

## Verification Checklist

- [ ] `Chat` is the only active route in the dashboard shell
- [ ] sidebar branding shows `Frankenbeast v0.9.0`
- [ ] shell styling reflects the Frankenbeast green/black/industrial brand palette
- [ ] the shell is usable on mobile and desktop without horizontal overflow
- [ ] assistant messages stream over WebSocket
- [ ] typing placeholder appears before the first assistant delta
- [ ] user messages show receipt state transitions
- [ ] web chat matches REPL chat 1:1 for turn routing, continuation, slash-command behavior, approvals, and execution outcomes
- [ ] approvals are server-authoritative and survive reconnect
- [ ] unauthorized origins and cross-session socket messages are rejected
- [ ] prompt injection scanning runs before turn routing on the WebSocket path

Plan complete and saved to `docs/plans/2026-03-09-franken-web-dashboard-chat-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
