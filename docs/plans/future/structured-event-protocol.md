# Future Enhancement: Structured Event Protocol

**Date:** 2026-03-16
**Status:** Documented for future implementation
**Prerequisite:** Plan 1 (Foundation) must be complete

---

## Problem

With Plan 1's line-buffered stdout/stderr capture, the beast daemon knows that an agent process is alive and producing output, but it can't interpret what the agent is doing. Phase transitions, progress percentages, token spend, and structured errors are all buried in raw log text.

## Proposed Design

The spawned frankenbeast process writes JSON events to a dedicated file descriptor (fd 3) or a named pipe alongside its normal stdout/stderr output.

**Event types:**

```typescript
interface AgentStructuredEvent {
  type: 'phase.enter' | 'phase.exit' | 'progress' | 'token.spend' | 'error.structured' | 'checkpoint';
  timestamp: string;
  payload: Record<string, unknown>;
}
```

**Examples:**

```json
{ "type": "phase.enter", "timestamp": "...", "payload": { "phase": "planning", "iteration": 2 } }
{ "type": "progress", "timestamp": "...", "payload": { "percent": 45, "message": "Executing task 3/7" } }
{ "type": "token.spend", "timestamp": "...", "payload": { "tokens": 1500, "cost": 0.045, "model": "claude-opus-4-6" } }
{ "type": "error.structured", "timestamp": "...", "payload": { "phase": "planning", "error": "CritiqueSpiralError", "iteration": 3, "maxIterations": 3 } }
```

**Daemon-side:**

`ProcessSupervisor` opens fd 3 on the child process and attaches a line reader. Structured events are parsed and:
- Published to the `BeastEventBus` (forwarded to SSE clients)
- Stored in a new `beast_structured_events` SQLite table
- Used to update `BeastRun` metadata (current phase, progress percentage)

**Dashboard-side:**

- Progress bar per agent in the agent list
- Phase indicator in the detail panel header
- Real-time token spend tracking
- Structured error display with phase context

## Trade-offs

**Pros:**
- Rich observability without parsing log text
- Dashboard can show progress bars, phase indicators, cost tracking
- Errors include structured context (which phase, which iteration, what was attempted)

**Cons:**
- Requires modifying the spawned process (session pipeline) to emit events
- Protocol must be versioned to handle schema evolution
- fd 3 approach requires `stdio: ['ignore', 'pipe', 'pipe', 'pipe']` — may not work on all platforms

**Alternative: Named pipe**
- Create `.frankenbeast/.build/run-events/<runId>.pipe` before spawning
- Pass path as `FRANKENBEAST_EVENT_PIPE` env var
- More portable, but adds filesystem coordination

## Why Deferred

Plan 1's stdout/stderr capture provides sufficient observability for the initial release. The structured protocol adds significant value but requires cooperation from the spawned process, which means modifying the session pipeline — a larger change that should be its own focused effort.
