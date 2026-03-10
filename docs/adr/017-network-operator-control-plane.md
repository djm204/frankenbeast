# ADR-017: Network Operator Control Plane

## Status

Accepted

## Context

Frankenbeast now has multiple request-serving surfaces:

- the websocket chat server
- the dashboard UI
- the external comms gateway

Before this ADR, those surfaces were started independently and configured piecemeal. That made local operation fragmented and created drift between CLI behavior, dashboard behavior, and service configuration.

## Decision

We introduce `frankenbeast network` as the canonical local service operator.

The operator:

- selects active services from canonical config
- supports foreground supervision and detached mode
- owns operator-facing config assembly for managed services
- exposes the same service state and config semantics through the dashboard
- treats `secure` and `insecure` as explicit operator modes

Services remain standalone-capable. Managed operator config overrides local service discovery when a service is launched by the operator.

`frankenbeast chat` becomes network-aware:

- attach to managed chat when it is healthy
- otherwise fall back to standalone CLI chat

## Consequences

Positive:

- one canonical local startup and teardown surface
- dashboard and CLI operate over the same service model
- config and status become consistent across managed services
- future service additions fit a single registry/supervision pattern

Tradeoffs:

- the orchestrator now owns more local process-management behavior
- the dashboard depends on operator routes in the chat server process
- secure backend depth remains a staged follow-up even though the mode split is now explicit
