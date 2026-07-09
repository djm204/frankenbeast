# ADR-007: Session Token Activation Model

## Status

Accepted

## Context

The requirements state "the agent only holds session tokens activated by human approval." The agent cannot execute high-stakes operations until a human explicitly grants a scoped token with an expiry.

## Decision

Define a `SessionToken` value object with `scope`, `expiresAt`, `grantedBy`, and `approvalId` fields. The `ApprovalGateway` creates and stores a `SessionToken` upon successful APPROVE response (when a `SessionTokenStore` is provided). The `SessionTokenStore` can remain in-memory for single-process use or persist active tokens to a JSON file shared by short-lived governor processes. It auto-expires tokens on access and when a persisted store is loaded.

The standalone governor HTTP app exposes `POST /v1/approval/session/validate` so external callers can validate a token against the same shared store. Validation requests require the governor signing secret in production and fail closed with `503` when no session token store is configured.

Token IDs are generated via `randomUUID()` from `node:crypto`.

## Consequences

- **Positive:** Provides an audit chain from approval to execution.
- **Positive:** Tokens auto-expire, preventing stale approvals from being reused.
- **Positive:** Revocation is immediate via `store.revoke(tokenId)`.
- **Positive:** Short-lived governor processes can share approval tokens through an explicit persisted store and a signed validation endpoint.
- **Negative:** Deployments that need cross-process validation must configure a shared `SessionTokenStore` or `sessionTokenStorePath`; otherwise validation fails closed.
