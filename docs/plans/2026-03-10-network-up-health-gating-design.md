# Network Up Health Gating Design

**Date:** 2026-03-10
**Status:** Approved
**Scope:** `franken-orchestrator`

## Goal

Make `frankenbeast network up` trustworthy:

- do not report services as started until they are actually healthy
- detect configured port collisions before spawn
- reuse an already running managed Frankenbeast service when safe
- fail fast when some unrelated process owns the configured port
- suppress redundant child banners/noise for network-managed services
- show consistent Frankenbeast version branding in managed child output

## Current Problem

The current network operator treats `spawn()` as success. In foreground mode:

- `network up` prints `Started N services` immediately
- child services can fail moments later with `EADDRINUSE`
- the supervisor does not preflight configured ports
- the operator cannot distinguish a healthy existing managed service from an unrelated listener
- network-managed child CLIs print their own full banners, which looks like duplicate startup
- child banner versioning comes from package-local versions, not the root Frankenbeast version

## Design

### Startup Contract

Each service startup goes through:

1. preflight
2. spawn or reuse decision
3. health confirmation
4. user-visible success reporting

`network up` should only print success after all selected services either:

- reached healthy state, or
- were safely reused as already-running managed services

If any required service fails startup, the command should stop any newly started dependents and return a clear error.

### Port Ownership Rules

For services with configured `host` and `port`:

- if the port is free, spawn normally
- if the port is occupied, probe whether it is the expected Frankenbeast-managed service
- if it matches, mark the service as `already running` and reuse it
- if it does not match, abort with a conflict error naming the service and port

For `chat-server`, the authoritative probe is its HTTP `/health` endpoint plus expected service identity from network-managed state.

### Managed State Rules

Foreground mode should still track the services it started during the current `network up` invocation, even if it does not persist detached state in the same way.

The operator needs enough live state to:

- decide whether a running service is managed
- stop only services it started when startup fails
- render accurate startup messages

### Output Rules

Network-managed child processes should not print the full ASCII banner again.

Instead:

- the parent `network up` banner remains the single top-level startup banner
- child output is prefixed by service id only
- managed child CLI paths receive an environment flag indicating they are under network supervision

When managed output still needs version branding, it should use the root Frankenbeast version rather than a package-local version so the operator and child surfaces agree.

## Testing

Add or update tests for:

- reusing an already running managed chat server
- failing fast when a conflicting non-managed listener occupies the configured port
- not printing `Started ...` before health confirmation
- stopping partially started services when a later startup fails
- suppressing child banner output in managed mode

