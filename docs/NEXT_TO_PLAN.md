# Next to Plan

Features and work items to brainstorm and plan after the current execution gap is closed.

---

## Dashboard UI

**Priority:** High
**Depends on:** Execution gap closed (plan-2026-03-05)

A web-based dashboard for managing and interacting with a running Frankenbeast instance.

### Capabilities
- **Module management** — enable/disable modules, view module status and health
- **Configuration** — edit all module configs from a single UI (firewall rules, critique thresholds, governor policies, heartbeat intervals, etc.)
- **Metrics & statistics** — token usage, cost tracking, task success rates, latency, model attribution (powered by franken-observer)
- **Chat UI** — send goals to your running Frankenbeast instance and see results in real-time
- **MCP configuration** — add/remove MCP servers, configure tool permissions, view available tools
- **API key management** — secure (encrypted) storage of provider API keys, no plaintext at rest (OS keychain or encrypted config)
- **Trace viewer** — integrate franken-observer's TraceServer or build on top of its SQLite data

### Constraints
- Secure API key storage is mandatory — no plaintext persistence
- Should work locally (localhost) with optional remote access
- Consider Hono as the HTTP framework (user preference)
