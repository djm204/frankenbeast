# ADR-016: Chat Server Entrypoint for Dashboard Chat

## Status
Accepted

## Context
`franken-web` had a dashboard chat UI and `franken-orchestrator` already had HTTP chat routes plus WebSocket transport primitives, but there was no checked-in command that started a real backend for the UI to connect to.

That left the web chat in an awkward state:

- the UI was not backed by a first-class local run path
- the server bootstrap was implicit instead of productized
- web chat risked diverging from `frankenbeast chat` behavior if it grew its own runtime wiring

## Decision
Add a first-class `frankenbeast chat-server` subcommand in `franken-orchestrator` and make the dashboard chat use it as its backend surface.

The server entrypoint:

- starts a real Node HTTP server
- mounts the existing Hono chat app
- attaches the WebSocket chat transport on `/v1/chat/ws`
- uses the same chat runtime wiring as CLI chat
- defaults to `127.0.0.1:3737`
- only opens cross-origin WebSocket access when explicitly allowlisted

`franken-web` remains a presentation layer. It connects over HTTP for session bootstrap and WebSocket for live chat streaming, but it does not own a separate chat runtime.

## Consequences
- the truthful local run path is now a pair of explicit commands instead of ad hoc bootstrap glue
- web chat behavior stays aligned with CLI chat because both surfaces share the same runtime construction
- localhost-first defaults reduce accidental exposure during development
- future dashboard modules can build on the same server shell without reintroducing a second chat stack

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Keep HTTP/WebSocket bootstrap as test-only wiring | Minimal new CLI surface | No real developer command, weak discoverability | The web app needed a truthful, supported run path |
| Let `franken-web` own more backend chat behavior | Faster local iteration in the frontend package | Runtime drift from CLI chat, duplicated semantics | The requirement is 1:1 CLI chat behavior |
| Add a one-off script outside the CLI | Quick to wire | Not discoverable, bypasses existing provider/config CLI surface | We want a productized command, not temporary glue |
