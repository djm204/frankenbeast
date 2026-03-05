# ADR-003: Hono as HTTP Framework

## Status
Accepted

## Context
Three modules need HTTP servers: Firewall (proxy), Critique (review-as-a-service), Governor (webhook receiver). Need a lightweight, testable framework.

## Decision
Use Hono for all HTTP services. Key factors:
- `app.request()` enables in-memory testing without spinning up a server
- Minimal bundle size for Docker images
- Built-in middleware ecosystem
- TypeScript-first design

## Consequences
- Consistent HTTP patterns across all services
- Tests run fast (no port binding)
- Trade-off: Hono ecosystem is smaller than Express
