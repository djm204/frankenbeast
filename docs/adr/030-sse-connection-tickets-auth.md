# ADR-030: SSE with Connection Tickets for Dashboard Auth

- **Date:** 2026-03-16
- **Status:** Accepted
- **Deciders:** pfk

## Context

The beast daemon exposes an SSE (Server-Sent Events) endpoint for push-based updates to the dashboard, replacing the previous 4-second polling. SSE uses the `EventSource` browser API, which does not support custom HTTP headers (no `Authorization: Bearer <token>`).

The operator token must be validated before establishing the SSE stream, but it cannot be sent as a query parameter on the persistent connection (tokens in URLs appear in server logs, browser history, and network tooling).

## Decision

Use a **connection ticket** pattern — an industry-standard approach for authenticating SSE and WebSocket connections.

**Canonical endpoints:**

- Ticket issuance: `POST /v1/beasts/events/ticket`
- Dashboard stream: `GET /v1/beasts/events/stream/{connectionId}`

These paths are shared by the daemon routes in `packages/franken-orchestrator/src/http/routes/beast-sse-routes.ts` and the dashboard client in `packages/franken-web/src/lib/beast-api.ts`. Older per-agent `/api/beasts/:id/events` examples are not the dashboard stream contract.

**Flow:**

1. Dashboard calls `POST /v1/beasts/events/ticket` with `Authorization: Bearer <operator-token>`
2. Daemon validates the bearer token, generates a single-use UUID ticket, and stores its token digest in the shared Beast SQLite database with a 30-second TTL
3. Response returns a non-secret connection ID and sets the ticket in an `HttpOnly`, 30-second, `SameSite=Strict` cookie scoped only to `/v1/beasts/events/stream/{connectionId}`; HTTPS requests also set `Secure`
4. Dashboard opens `EventSource` to the canonical `/v1/beasts/events/stream/{connectionId}` endpoint without putting the ticket in the URL
5. Daemon reads the scoped cookie and validates it against the connection ID: the ticket must exist, match the connection scope, not be expired, and not be already used
6. Ticket is atomically marked consumed on first use; the short-lived consumed marker prevents native EventSource retries from looping
7. SSE stream is established and authenticated for the lifetime of the connection

**Server-side implementation:**

- The `sse_connection_tickets` table lives in the project Beast SQLite database shared by daemon processes using the same project root
- Only a SHA-256 digest of the operator token is persisted; consumed rows discard that digest
- An immediate SQLite transaction makes ticket consumption single-use across processes
- Cleanup interval (every 60s) removes expired issue and consumed-marker rows
- Ticket state survives daemon restarts while remaining bounded by the 30-second issue TTL and consumed-marker retention window

**Reconnection:**

When `EventSource` reconnects after a network interruption, it opens a new HTTP request. The client must obtain a fresh ticket before reconnecting. The dashboard client's `BeastApiClient.subscribeToEvents` method handles this by requesting a new ticket and creating a new `EventSource` for the canonical stream endpoint.

## Consequences

### Positive
- Operator token never appears in URLs, logs, or browser history
- Connection tickets never appear in proxy/server request URLs or access logs
- Tickets are single-use and short-lived — no replay risk
- Restart-safe and shared across daemon processes that use the same Beast database
- Works with existing bearer token auth model
- Industry standard pattern (used by Slack, GitHub Copilot, Stripe, Firebase)
- Recommended by OWASP WebSocket Security Cheat Sheet

### Negative
- Extra HTTP round-trip before SSE connection (one `POST` per connect/reconnect)
- Multi-host deployments must place the Beast database on shared storage or provide an equivalent shared ticket-store backend

### Risks
- If ticket cleanup interval is too slow, expired tickets accumulate (mitigated by 60s cleanup + 30s TTL)
- Race condition: ticket expires between issuance and SSE open (mitigated by 30s TTL — more than sufficient for a local connection)

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Token in query parameter | Simple, no extra round-trip | Token in URLs/logs/history; security risk | OWASP explicitly recommends against this |
| Long-lived operator-token cookie auth | Auto-sent by browser | Broad credential lifetime and CSRF exposure | A scoped, single-use connection-ticket cookie limits both lifetime and path exposure |
| Custom protocol over WebSocket | Full header support | More complex than SSE; bidirectional not needed | SSE is simpler for unidirectional push |
| mTLS / client certificates | Strong auth | Complex setup; not practical for a dev dashboard | Over-engineered for the use case |
