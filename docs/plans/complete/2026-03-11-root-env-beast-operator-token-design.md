# Root Env Beast Operator Token Design

**Problem:** The dashboard and chat server can diverge on Beast operator token discovery because the web app reads `packages/franken-web/.env.local` while `frankenbeast chat-server` primarily relies on process environment.

**Goal:** Make root `.env` the shared local source of truth for Beast operator token discovery while preserving existing `packages/franken-web/.env.local` setups as fallback.

## Decision

Token resolution for the chat server will use this precedence:

1. `process.env.FRANKENBEAST_BEAST_OPERATOR_TOKEN`
2. `process.env.VITE_BEAST_OPERATOR_TOKEN`
3. repository root `.env`
4. `packages/franken-web/.env.local`

## Scope

- Update the CLI chat-server startup path to read root `.env` before the web package local env file.
- Keep current process-env override behavior intact.
- Update docs to describe root `.env` as the preferred shared local configuration point.

## Non-Goals

- Introducing a general dotenv loader for the whole monorepo
- Removing support for `packages/franken-web/.env.local`
- Changing Beast route auth semantics

## Validation

- Unit test the chat-server startup path for root `.env` precedence.
- Retain coverage for package-local fallback behavior.
- Update docs so local setup instructions match actual behavior.
