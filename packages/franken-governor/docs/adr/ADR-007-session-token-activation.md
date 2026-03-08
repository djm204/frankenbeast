# ADR-007: Session Token Activation Model

## Status

Accepted

## Context

The requirements state "the agent only holds session tokens activated by human approval." The agent cannot execute high-stakes operations until a human explicitly grants a scoped token with an expiry.

## Decision

Define a `SessionToken` value object with `scope`, `expiresAt`, `grantedBy`, and `approvalId` fields. The `ApprovalGateway` creates and stores a `SessionToken` upon successful APPROVE response (when a `SessionTokenStore` is provided). The `SessionTokenStore` holds active tokens in memory and auto-expires them on access.

Token IDs are generated via `randomUUID()` from `node:crypto`.

## Consequences

- **Positive:** Provides an audit chain from approval to execution.
- **Positive:** Tokens auto-expire, preventing stale approvals from being reused.
- **Positive:** Revocation is immediate via `store.revoke(tokenId)`.
- **Negative:** Only meaningful within a single process; cross-process scenarios require additional infrastructure (deferred).
