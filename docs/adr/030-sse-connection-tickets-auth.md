# ADR-030: SSE with Connection Tickets for Dashboard Auth

- **Date:** 2026-03-16
- **Status:** Accepted
- **Deciders:** pfk

## Context

The beast daemon exposes an SSE (Server-Sent Events) endpoint for push-based updates to the dashboard, replacing the previous 4-second polling. SSE uses the `EventSource` browser API, which does not support custom HTTP headers (no `Authorization: Bearer <token>`).

The operator token must be validated before establishing the SSE stream, but it cannot be sent as a query parameter on the persistent connection (tokens in URLs appear in server logs, browser history, and network tooling).

## Decision

Use a **connection ticket** pattern — an industry-standard approach for authenticating SSE and WebSocket connections.

**Flow:**

1. Dashboard calls `POST /v1/beasts/events/ticket` with `Authorization: Bearer <operator-token>`
2. Daemon validates the bearer token, generates a single-use UUID ticket, stores it in an in-memory map with a 30-second TTL
3. Response: `{ ticket: "<uuid>" }`
4. Dashboard opens `EventSource` to `/v1/beasts/events/stream?ticket=<uuid>`
5. Daemon validates the ticket: must exist, not expired, not already used
6. Ticket is burned (deleted from map) on first use
7. SSE stream is established and authenticated for the lifetime of the connection

**Server-side implementation:**

- `Map<string, { token: string, expiresAt: number }>` in memory
- Cleanup interval (every 60s) removes expired tickets
- No persistence needed — tickets are ephemeral by design

**Reconnection:**

When `EventSource` auto-reconnects (network interruption), it opens a new HTTP request. The client must obtain a fresh ticket before reconnecting. The `useBeastEventStream` React hook handles this: on connection error, request a new ticket, then reconnect.

## Consequences

### Positive
- Operator token never appears in URLs, logs, or browser history
- Tickets are single-use and short-lived — no replay risk
- Stateless on the daemon side (in-memory map, no persistence)
- Works with existing bearer token auth model
- Industry standard pattern (used by Slack, GitHub Copilot, Stripe, Firebase)
- Recommended by OWASP WebSocket Security Cheat Sheet

### Negative
- Extra HTTP round-trip before SSE connection (one `POST` per connect/reconnect)
- In-memory ticket store is lost on daemon restart (acceptable — clients reconnect and get new tickets)

### Risks
- If ticket cleanup interval is too slow, expired tickets accumulate (mitigated by 60s cleanup + 30s TTL)
- Race condition: ticket expires between issuance and SSE open (mitigated by 30s TTL — more than sufficient for a local connection)

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Token in query parameter | Simple, no extra round-trip | Token in URLs/logs/history; security risk | OWASP explicitly recommends against this |
| Cookie-based auth | Auto-sent by browser | Requires session store; CORS cookie complexity; CSRF risk | Adds infrastructure complexity for a dev tool |
| Custom protocol over WebSocket | Full header support | More complex than SSE; bidirectional not needed | SSE is simpler for unidirectional push |
| mTLS / client certificates | Strong auth | Complex setup; not practical for a dev dashboard | Over-engineered for the use case |
