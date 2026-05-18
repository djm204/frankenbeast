# Chunk 1: Fail-Closed HTTP & Approval Boundaries — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat HTTP surface authenticated and make HITL approval fail closed instead of fail open.

**Architecture:** Generalize the existing `requireBeastOperatorAuth` middleware into a shared `requireOperatorAuth`, apply it to `/v1/chat/*` when an operator token is configured, and remove the three fail-open approval paths (non-TTY auto-approve, signature-required-without-verifier, governor server unsigned-by-default). No new runtime; pure boundary tightening with TDD.

**Tech Stack:** TypeScript, Hono, Vitest, existing `TransportSecurityService`, existing `GovernorPortAdapter`/`ApprovalGateway`.

---

## Verified Gap Evidence (current `main` @ `610a0ea`, 2026-05-17)

- `packages/franken-orchestrator/src/cli/dep-factory.ts:387-393` — `if (!stdin.isTTY)` wires `GovernorPortAdapter({ defaultDecision: 'approved' })`: non-interactive runs auto-approve every HITL gate.
- `packages/franken-governor/src/gateway/approval-gateway.ts:42` — `if (this.config.requireSignedApprovals && this.signatureVerifier)`: `requireSignedApprovals: true` with no verifier silently skips verification.
- `packages/franken-governor/src/server/app.ts:54` — `if (options.signingSecret)`: with no secret configured, `/v1/approval/respond` accepts unsigned responses.
- `packages/franken-orchestrator/src/http/chat-app.ts:100` — `/v1/chat/*` only has `requestSizeLimit`; no auth middleware. Chat session/message/approve routes are unauthenticated.
- Existing reusable pattern: `packages/franken-orchestrator/src/beasts/http/beast-auth.ts` already implements the exact bearer / `x-frankenbeast-operator-token` middleware to generalize.

## File Structure

- Create `packages/franken-orchestrator/src/http/operator-auth.ts` — shared `extractOperatorToken` + `requireOperatorAuth` middleware (one responsibility: operator-token gate).
- Modify `packages/franken-orchestrator/src/beasts/http/beast-auth.ts` — delegate to the shared helper (no behavior change).
- Modify `packages/franken-orchestrator/src/http/chat-app.ts` — apply `requireOperatorAuth` to `/v1/chat/*` when a token is configured; keep `/health` public.
- Modify `packages/franken-orchestrator/src/cli/dep-factory.ts` — replace non-TTY `defaultDecision: 'approved'` with a fail-closed `denied`/abort default unless `FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1`.
- Modify `packages/franken-governor/src/gateway/approval-gateway.ts` — constructor throws when `requireSignedApprovals && !signatureVerifier`.
- Modify `packages/franken-governor/src/server/app.ts` — reject unsigned `/v1/approval/respond` when no `signingSecret` unless `allowUnsignedApprovalsForTests: true`.
- Tests: `tests/integration/chat/chat-routes.test.ts`, `tests/unit/cli/run.test.ts`, `tests/integration/cli/dep-factory-wiring.test.ts`, `franken-governor/tests/unit/gateway/approval-gateway-security.test.ts`, `franken-governor/tests/unit/server/app.test.ts`.

---

## Task 1: Shared operator auth + chat route gating

**Files:**
- Create: `packages/franken-orchestrator/src/http/operator-auth.ts`
- Modify: `packages/franken-orchestrator/src/beasts/http/beast-auth.ts`
- Modify: `packages/franken-orchestrator/src/http/chat-app.ts:31` (`ChatAppOptions`), `:100` (middleware insertion)
- Test: `packages/franken-orchestrator/tests/integration/chat/chat-routes.test.ts`

- [ ] **Step 1: Write the failing chat-auth test**

In `tests/integration/chat/chat-routes.test.ts`, add:

```ts
describe('chat route operator auth', () => {
  it('rejects unauthenticated chat requests when an operator token is configured', async () => {
    const app = createChatApp({ ...baseChatOpts, operatorToken: 'secret-op-token' });
    const res = await app.request('/v1/chat/sessions', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('accepts chat requests with a valid bearer operator token', async () => {
    const app = createChatApp({ ...baseChatOpts, operatorToken: 'secret-op-token' });
    const res = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-op-token', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).not.toBe(401);
  });

  it('keeps /health public', async () => {
    const app = createChatApp({ ...baseChatOpts, operatorToken: 'secret-op-token' });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });
});
```

(`baseChatOpts` = the existing fixture used by sibling tests in this file.)

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/integration/chat/chat-routes.test.ts`
Expected: FAIL — POST `/v1/chat/sessions` returns 2xx/4xx-non-401 because no auth middleware exists.

- [ ] **Step 3: Create the shared middleware**

Create `packages/franken-orchestrator/src/http/operator-auth.ts`:

```ts
import { createMiddleware } from 'hono/factory';
import { HttpError } from './middleware.js';
import { TransportSecurityService } from './security/transport-security.js';

export interface OperatorAuthOptions {
  operatorToken: string;
  security: TransportSecurityService;
}

export function extractOperatorToken(headerValue: string | undefined): string | undefined {
  if (!headerValue) return undefined;
  const [scheme, token] = headerValue.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

export function requireOperatorAuth(options: OperatorAuthOptions) {
  return createMiddleware(async (c, next) => {
    const provided = extractOperatorToken(c.req.header('authorization'))
      ?? c.req.header('x-frankenbeast-operator-token')
      ?? undefined;

    if (!options.security.verifyOperatorToken(provided, options.operatorToken)) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Operator authentication is required');
    }

    await next();
  });
}
```

- [ ] **Step 4: Delegate `beast-auth.ts` to the shared helper**

Replace the body of `requireBeastOperatorAuth` in `beasts/http/beast-auth.ts` so it returns `requireOperatorAuth({ operatorToken: options.operatorToken, security: options.security })`. Keep `BeastAuthOptions` and the export name for callers.

- [ ] **Step 5: Wire chat auth**

In `chat-app.ts`: add `operatorToken?: string;` to `ChatAppOptions` (near line 31). In `createChatApp`, immediately after the existing `app.use('/v1/chat/*', requestSizeLimit(DEFAULT_MAX_BODY_SIZE));` (line 100), add:

```ts
const effectiveOperatorToken = opts.operatorToken ?? opts.beastControl?.operatorToken;
if (effectiveOperatorToken) {
  app.use('/v1/chat/*', requireOperatorAuth({
    operatorToken: effectiveOperatorToken,
    security: opts.beastControl?.security ?? transportSecurity,
  }));
}
```

`/health` is registered outside `/v1/chat/*`, so it stays public.

- [ ] **Step 6: Run the test, verify it passes**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/integration/chat/chat-routes.test.ts`
Expected: PASS, including pre-existing chat tests (add `authorization: 'Bearer …'` to any pre-existing test that now 401s — those tests asserting unauthenticated success are the bug).

- [ ] **Step 7: Commit**

```bash
git add packages/franken-orchestrator/src/http/operator-auth.ts packages/franken-orchestrator/src/beasts/http/beast-auth.ts packages/franken-orchestrator/src/http/chat-app.ts packages/franken-orchestrator/tests/integration/chat/chat-routes.test.ts
git commit -m "fix(orchestrator): require operator auth on chat HTTP routes"
```

---

## Task 2: Fail-closed non-interactive approval

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts:387-393`
- Test: `packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts`

- [ ] **Step 1: Write the failing test**

In `dep-factory-wiring.test.ts`:

```ts
it('does not auto-approve HITL in non-interactive mode by default', async () => {
  const prev = process.env.FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL;
  delete process.env.FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL;
  const paths = createTempPaths();
  cleanups.push(paths.root);
  const { deps, finalize } = await createCliDeps({
    paths, baseBranch: 'main', budget: 1.0, provider: 'claude',
    noPr: true, verbose: false, reset: false,
  });
  const outcome = await deps.governor.requestApproval({
    requestId: 'r1', summary: 's', risk: 'high',
  } as never);
  expect(outcome.decision).not.toBe('approved');
  await finalize();
  if (prev !== undefined) process.env.FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL = prev;
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/integration/cli/dep-factory-wiring.test.ts`
Expected: FAIL — decision is `'approved'` (current `dep-factory.ts:393`).

- [ ] **Step 3: Implement fail-closed default**

In `dep-factory.ts`, in the `if (!stdin.isTTY)` branch (line 387), replace `defaultDecision: 'approved' as const` with:

```ts
defaultDecision: (process.env.FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL === '1'
  ? 'approved'
  : 'denied') as const,
```

Update the adjacent comment to: `// Non-interactive mode fails closed (denied) unless FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1 is explicitly set.`

- [ ] **Step 4: Run it, verify it passes**

Run: `cd packages/franken-orchestrator && npm test -- --run tests/integration/cli/dep-factory-wiring.test.ts tests/unit/cli/run.test.ts`
Expected: PASS. Fix any run.test.ts case that assumed non-interactive auto-approve by setting the env var in that test's arrange block.

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/cli/dep-factory.ts packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts packages/franken-orchestrator/tests/unit/cli/run.test.ts
git commit -m "fix(orchestrator): non-interactive HITL fails closed by default"
```

---

## Task 3: Governor signed-approval fail-closed

**Files:**
- Modify: `packages/franken-governor/src/gateway/approval-gateway.ts:32` (constructor), `:42`
- Modify: `packages/franken-governor/src/server/app.ts:54`
- Test: `packages/franken-governor/tests/unit/gateway/approval-gateway-security.test.ts`, `packages/franken-governor/tests/unit/server/app.test.ts`

- [ ] **Step 1: Write the failing gateway test**

In `approval-gateway-security.test.ts`:

```ts
it('throws at construction when signed approvals are required without a verifier', () => {
  expect(() => new ApprovalGateway({
    channel: fakeChannel,
    auditRecorder: fakeRecorder,
    config: { requireSignedApprovals: true },
    // no signatureVerifier
  } as never)).toThrow(/signed approvals.*verifier/i);
});
```

- [ ] **Step 2: Write the failing server test**

In `app.test.ts`:

```ts
it('rejects unsigned approval responses when no signing secret is configured', async () => {
  const app = createGovernorApp({ /* no signingSecret, no allowUnsignedApprovalsForTests */ } as never);
  const res = await app.request('/v1/approval/respond', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: 'r1', decision: 'approved' }),
  });
  expect(res.status).toBe(401);
});
```

- [ ] **Step 3: Run both, verify they fail**

Run: `cd packages/franken-governor && npm test -- --run tests/unit/gateway/approval-gateway-security.test.ts tests/unit/server/app.test.ts`
Expected: FAIL — gateway constructs silently; server returns 2xx on unsigned.

- [ ] **Step 4: Implement gateway fail-closed**

In `approval-gateway.ts` constructor (after `this.signatureVerifier = deps.signatureVerifier;`, ~line 32):

```ts
if (deps.config.requireSignedApprovals && !deps.signatureVerifier) {
  throw new Error('Signed approvals are required but no signatureVerifier was supplied');
}
```

Then at line 42 the `&& this.signatureVerifier` guard becomes safe to keep (verifier guaranteed present when required).

- [ ] **Step 5: Implement server fail-closed**

In `server/app.ts`, add `allowUnsignedApprovalsForTests?: boolean` to the options type. Replace the `if (options.signingSecret) { … }` block (line 54) so that when `!options.signingSecret`:

```ts
if (!options.signingSecret) {
  if (!options.allowUnsignedApprovalsForTests) {
    return c.json({ error: { message: 'Signing secret required for approval responses' } }, 401);
  }
} else {
  const signature = c.req.header('x-governor-signature');
  if (!signature) return c.json({ error: { message: 'Missing signature' } }, 401);
  const rawBody = JSON.stringify(body);
  const expected = createHmac('sha256', options.signingSecret).update(rawBody).digest('hex');
  if (signature !== `sha256=${expected}`) return c.json({ error: { message: 'Invalid signature' } }, 401);
}
```

- [ ] **Step 6: Run both, verify they pass**

Run: `cd packages/franken-governor && npm test -- --run tests/unit/gateway/approval-gateway-security.test.ts tests/unit/server/app.test.ts`
Expected: PASS. Update existing governor tests that constructed an app with no secret to pass `allowUnsignedApprovalsForTests: true`.

- [ ] **Step 7: Commit**

```bash
git add packages/franken-governor/src/gateway/approval-gateway.ts packages/franken-governor/src/server/app.ts packages/franken-governor/tests/unit/gateway/approval-gateway-security.test.ts packages/franken-governor/tests/unit/server/app.test.ts
git commit -m "fix(governor): fail closed on unsigned/unverifiable approvals"
```

---

## Task 4: Closeout — ADR + audit follow-up + verification

**Files:**
- Create: `docs/adr/034-fail-closed-http-and-approval-boundaries.md`
- Modify: `docs/audits/agent-systems-audit-2026-04-28.md`

- [ ] **Step 1: Write ADR-034**

Use the repo ADR template (`docs/adr/ADR-000-template.md`). Record: chat `/v1/chat/*` now requires an operator token when one is configured; non-interactive HITL defaults to `denied` unless `FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1`; `ApprovalGateway` refuses to construct when signed approvals are required without a verifier; governor server rejects unsigned approval responses unless an explicit test flag is set. State the residual: this does not add OIDC or transport encryption.

- [ ] **Step 2: Audit follow-up**

In `docs/audits/agent-systems-audit-2026-04-28.md`, add/extend a `## Follow-Up Implementation Status` section mapping the Pillar 3 gap lines ("HTTP chat routes are unauthenticated", "Non-interactive CLI can auto-approve HITL", "Signed approval enforcement is misconfigurable", "Governor HTTP server allows unsigned operation") to `fixed`, each citing the commit and test.

- [ ] **Step 3: Verify the chunk**

```bash
cd packages/franken-orchestrator && npm test -- --run tests/integration/chat/chat-routes.test.ts tests/unit/cli/run.test.ts tests/integration/cli/dep-factory-wiring.test.ts && npm run typecheck
cd ../franken-governor && npm test -- --run tests/unit/gateway/approval-gateway-security.test.ts tests/unit/server/app.test.ts && npm run typecheck
```
Expected: all exit `0`.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/034-fail-closed-http-and-approval-boundaries.md docs/audits/agent-systems-audit-2026-04-28.md
git commit -m "docs: ADR-034 and audit follow-up for fail-closed boundaries"
```

---

## Self-Review

- **Spec coverage:** All four Pillar-3 boundary gaps (unauth chat, non-TTY auto-approve, signature misconfig, governor unsigned default) are each mapped to a task with a failing-first test. Chat-auth, dep-factory, gateway, and server are all addressed.
- **Placeholder scan:** Every code step shows the actual code; every test step shows assertions against real symbols (`createChatApp`, `createCliDeps`, `ApprovalGateway`, `createGovernorApp`, `TransportSecurityService.verifyOperatorToken`).
- **Type consistency:** `requireOperatorAuth`/`OperatorAuthOptions` reused by `beast-auth.ts`; `ChatAppOptions.operatorToken` is the only new field; `allowUnsignedApprovalsForTests` named identically in server code and tests; `FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL` used identically in code and tests.

## Execution Handoff

Plan complete. Two execution options: **(1) Subagent-Driven (recommended)** — fresh subagent per task with review between; **(2) Inline Execution** via executing-plans with checkpoints.
