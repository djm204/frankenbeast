# ADR-002: Approval Channel Strategy Pattern

## Status

Accepted

## Context

MOD-07 must support CLI prompts (primary) and Slack webhooks (secondary) for collecting human approval. Future channels (Discord, web UI, IDE extension) are anticipated. The gateway should not know which channel is active.

## Decision

Define an `ApprovalChannel` interface with a single async method `requestApproval(request): Promise<response>`. CLI and Slack are concrete implementations injected into `ApprovalGateway`. The gateway delegates to whichever channel was injected and does not contain any channel-specific logic.

```typescript
interface ApprovalChannel {
  readonly channelId: string;
  requestApproval(request: ApprovalRequest): Promise<ApprovalResponse>;
}
```

## Consequences

- **Positive:** Adding a new channel requires only a new class implementing `ApprovalChannel`.
- **Positive:** Tests inject a `FakeChannel` that resolves immediately — no I/O.
- **Positive:** Gateway logic (timeout, audit, security) is tested independently of any channel.
- **Negative:** Multi-channel fanout (first responder wins) is deferred to a future PR.
