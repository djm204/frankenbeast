# ADR-034: Operator Auth for All Control-Plane Routes

- **Date:** 2026-06-28
- **Status:** Accepted
- **Deciders:** David Mendez (with Claude Code), per issues #344, #359 (ARCH-001), #360 (ARCH-002), #345

## Context

ADR-034 introduced the shared `requireOperatorAuth` middleware and gated
`/v1/chat/*` behind an operator token whenever one is configured. However, the
chat HTTP app (`packages/franken-orchestrator/src/http/chat-app.ts`) mounts
several other control-plane route groups that were left outside that boundary:

- `/v1/network/*` — start/stop/restart services, read logs, read/write the
  orchestrator config on disk.
- `/api/security/*` — read and mutate the security profile.
- `/api/skills/*` — install/remove/inspect skills.
- `/api/dashboard/*`, `/api/analytics/*` — expose operational and cost state.
- `/v1/comms/inbound` and `/v1/comms/action` — generic ingress that forwards
  arbitrary JSON straight into the comms gateway runtime, bypassing the
  per-provider Slack/Discord/WhatsApp webhook signature verification that
  guards the `/webhooks/*` routes.

Any caller that could reach the HTTP server could therefore drive privileged
process/config control, mutate security settings, manage skills, read sensitive
state, or inject inbound messages/actions — even though chat and the beast
control plane required the operator token. This is an architectural boundary
inconsistency, not a single-route bug: two ingress trust models (signed
webhooks vs. generic JSON) crossed into the same runtime without an equivalent
gate.

## Decision

Apply the existing `requireOperatorAuth` middleware to every sensitive
control-plane route group using the same `effectiveOperatorToken`
(`opts.operatorToken ?? opts.beastControl?.operatorToken`) and transport
security service already used for `/v1/chat/*`. Gating is registered in
`createChatApp` before the routes are mounted, for both the exact base path and
the `/*` wildcard (Hono's `/base/*` does not match the collection root, mirroring
the beast/agent guard).

Gated groups: `/v1/chat`, `/v1/network`, `/v1/comms`, `/api/security`,
`/api/skills`, `/api/dashboard`, `/api/analytics`.

The generic comms endpoints `/v1/comms/inbound` and `/v1/comms/action` are
covered by the `/v1/comms/*` guard. Provider webhook routes (`/webhooks/*`)
retain their own per-channel signature verification and are intentionally not
moved behind operator auth, and the public `/comms/health` probe stays open.

Consistent with ADR-034, the gate is conditional on an operator token being
configured; `startChatServer` independently fails closed by refusing to expose
a server (managed mode or non-loopback host) when no token is set. Requests
that present no token or an incorrect token are rejected with `401` via
`TransportSecurityService.verifyOperatorToken` (constant-time comparison). When
browser clients authenticate through the HttpOnly operator cookie, unsafe
methods (`POST`/`PATCH`/`PUT`/`DELETE`) also require a same-origin `Origin`
header and reject non-`same-origin` Fetch Metadata signals such as
`Sec-Fetch-Site: cross-site`, `same-site`, or `none`. For TLS-terminated
reverse proxies, `x-forwarded-proto` and `x-forwarded-host` are honored when
checking the external same-origin URL so legitimate HTTPS dashboard posts are
not downgraded to the internal Node `http://` adapter origin. Bearer-token
clients keep
working for CLI/API automation; the extra browser-cookie check is a CSRF-style
mutation guard, not a replacement for operator tokens.

## Consequences

- Positive: A single, consistent operator boundary across the whole HTTP
  control plane. Direct comms injection now requires the operator token,
  closing the webhook-signature bypass while preserving signed-webhook ingress.
- Positive: No new runtime or auth scheme — reuses ADR-034 middleware and the
  existing `FRANKENBEAST_BEAST_OPERATOR_TOKEN` server-side plumbing. Browser
  clients remain same-origin and do not receive the long-lived operator token.
- Trade-off: Non-browser first-party callers of the network/comms/security/
  skills/dashboard/analytics APIs must send the operator token
  (`Authorization: Bearer <token>` or `x-frankenbeast-operator-token: <token>`) once a token
  is configured. Vite dev browser requests rely on the server-side proxy to
  attach the token.
- Trade-off: Mirroring ADR-034, when no operator token is configured the gate
  is inactive; loopback/dev exposure relies on `startChatServer`'s server-level
  fail-closed check rather than per-route rejection.
- Regression tests assert unauthenticated/invalid requests to each group return
  `401`, authenticated requests pass, comms inbound/action are gated, and the
  Slack webhook route is rejected by signature verification rather than the
  operator gate.
