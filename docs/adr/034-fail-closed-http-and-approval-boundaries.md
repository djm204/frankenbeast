# ADR-034: Fail-Closed HTTP & Approval Boundaries

- **Date:** 2026-05-18
- **Status:** Accepted
- **Deciders:** pfk (with Claude Code), per security-hardening Chunk 1

## Context

The 2026-04-28 agent-systems audit (Pillar 3 — Identity Boundaries) found four
fail-open boundaries, re-verified against `main` on 2026-05-17:

- `/v1/chat/*` HTTP routes (session create/read, message submit, approval
  update) were mounted with no operator/session authentication.
- Non-interactive CLI runs wired `GovernorPortAdapter` with
  `defaultDecision: 'approved'`, so every HITL gate auto-approved in CI / piped
  input.
- `ApprovalGateway` verified signatures only when *both*
  `requireSignedApprovals` and a `signatureVerifier` were present —
  `requireSignedApprovals: true` with no verifier silently skipped
  verification.
- The governor HTTP server accepted unsigned `/v1/approval/respond` requests
  whenever no signing secret was configured.

## Decision

Tighten all four boundaries to fail closed; no new runtime, pure boundary
hardening with TDD:

- Generalize the existing beast operator-auth middleware into a shared
  `requireOperatorAuth` (`packages/franken-orchestrator/src/http/operator-auth.ts`).
  `createChatApp` applies it to `/v1/chat/*` whenever an operator token is
  configured (explicit `operatorToken` or `beastControl.operatorToken` —
  matching the existing `VITE_BEAST_OPERATOR_TOKEN` pattern franken-web
  already uses for beast routes). `/health` stays public. `beast-auth.ts`
  delegates to the shared helper.
- **Fail-closed startup**: `startChatServer` refuses to start when chat is
  *exposed* (managed-network mode OR non-loopback host) without an effective
  operator token. Loopback-only dev without a token remains allowed.
- **First-party client plumbing**: `ChatApiClient` (franken-web) accepts an
  operator token and sends `Authorization: Bearer …` on every `/v1/chat/*`
  request — wired from `VITE_BEAST_OPERATOR_TOKEN` via `ChatShell`,
  consistent with `BeastApiClient`. `network/chat-attach.ts` accepts an
  operator token and presents it on remote session create; the CLI resolves
  it via the same `resolveBeastOperatorToken` path as `chat-server`.
- **Iteration history:** PR #296 Round-1 originally decoupled chat from the
  beast token to avoid breaking franken-web; Round-2 Codex review correctly
  flagged that this left the audited gap effectively unwired in the managed
  path. The final design re-couples and plumbs clients instead — closing
  the gap in the real deployment path.
- Non-interactive HITL defaults to **`rejected`** unless
  `FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1` is explicitly set. Note: the
  Chunk 1 plan specified the literal `'denied'`, but `ApprovalOutcome.decision`
  is `'approved' | 'rejected' | 'abort'` — `'denied'` is not a member, so
  `'rejected'` (the valid "not approved" value) is used to keep typecheck green
  and semantics correct.
- `ApprovalGateway` throws at construction when `requireSignedApprovals` is set
  without a `signatureVerifier`.
- The governor server rejects unsigned `/v1/approval/respond` with `401` when no
  signing secret is configured, unless `allowUnsignedApprovalsForTests: true`
  is explicitly passed.

Commits: `9cb1259` (chat auth), `b984d2d` (non-interactive HITL),
`05fb8ef` (governor signed-approval).

## Consequences

### Positive
- The chat HTTP surface and HITL approval paths fail closed by default.
- Misconfiguration (signed-required-without-verifier, unsigned governor) is now
  a hard, early failure instead of a silent bypass.

### Negative
- Existing non-interactive automation that relied on implicit auto-approve must
  now set `FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1`.
- Callers of `createChatApp` with an operator token must send the bearer token
  on `/v1/chat/*` requests.

### Risks
- A `'rejected'` default for unanswerable non-interactive HITL gates a single
  decision rather than aborting the run; downstream loop behavior on repeated
  rejection is unchanged from existing reject handling.

## Residual (out of scope)

This chunk does not add OIDC, downscoped cloud-token issuance, or transport
encryption (TLS/mTLS). Those remain separate future specs.

**Browser static-token limitation.** franken-web carries
`VITE_BEAST_OPERATOR_TOKEN` as a build-time env var that is therefore embedded
in the client bundle. This is the *pre-existing*, repo-wide mechanism (already
used by `BeastApiClient` for beast routes) — chat now follows the same pattern
for consistency. Replacing the static token with short-lived, server-minted
bootstrap credentials is a broader hardening initiative tracked separately;
the present change closes the audited gap (chat requires a token in any
exposed deployment) without introducing a new secret-exposure pattern. The
chat session-token mechanism already exists for the WebSocket path;
extending it to the HTTP bootstrap is the next natural step.

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Keep plan's literal `'denied'` | Matches plan prose verbatim | Not a member of `ApprovalOutcome.decision`; breaks typecheck | Type-invalid; `'rejected'` is the correct fail-closed enum |
| Default non-interactive HITL to `'abort'` | Hard stop on unattended gate | Aborts entire run on any gate | Too aggressive for a single-gate default; `'rejected'` is the conservative deny |
| Always require chat auth (no opt-in) | Strongest default | Breaks unauthenticated local/dev usage with no token configured | Token-gated when configured preserves existing tokenless local flows |
