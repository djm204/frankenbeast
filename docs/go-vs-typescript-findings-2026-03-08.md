# Go vs TypeScript Findings — Frankenbeast

**Date:** 2026-03-08
**Question:** Would any parts of the current codebase materially benefit, for performance or security, from being implemented in Go instead of TypeScript?

## Executive Summary

Yes, but only in narrow places.

The critical point is this:

- most of the current security risk in Frankenbeast is not caused by TypeScript
- most of the current latency is dominated by LLM calls, subprocesses, network I/O, and external tools
- a Go rewrite would only be justified for specific long-lived, internet-facing, concurrency-heavy services

If you rewrite the wrong parts in Go, you will add complexity without meaningfully improving the system.

My current judgment:

- **Do not rewrite the orchestrator, planner, chat engine, or tool orchestration in Go**
- **Consider Go only for specific edge/control-plane services or a hardened subprocess daemon**
- **Fix the current security flaws in TypeScript first**

---

## Findings

### 1. Rewriting the current governor or firewall in Go would not fix the highest-risk issues

This is the most important point.

The biggest security defects I found are implementation and boundary issues, not Node runtime problems:

- unauthenticated governor control plane in [`app.ts`](/home/pfk/dev/frankenbeast/franken-governor/src/server/app.ts)
- non-raw-body signature verification and non-fail-closed wiring in [`app.ts`](/home/pfk/dev/frankenbeast/franken-governor/src/server/app.ts) and [`approval-gateway.ts`](/home/pfk/dev/frankenbeast/franken-governor/src/gateway/approval-gateway.ts)
- unauthenticated firewall proxy endpoints in [`app.ts`](/home/pfk/dev/frankenbeast/frankenfirewall/src/server/app.ts)
- raw error leakage in [`middleware.ts`](/home/pfk/dev/frankenbeast/frankenfirewall/src/server/middleware.ts)

Those problems would still exist in Go if you carried the same design forward.

**Conclusion:** Go is not the first lever here. The correct first step is to harden auth, signature verification, rate limiting, and request validation in the existing TS services.

### 2. The firewall hot path is already fast enough that Go is hard to justify today

The repo already contains a benchmark for the firewall pipeline in [`pipeline.bench.ts`](/home/pfk/dev/frankenbeast/frankenfirewall/src/pipeline/pipeline.bench.ts), and the README claims about **~495,000 ops/sec** for the interceptor pipeline in [`README.md`](/home/pfk/dev/frankenbeast/frankenfirewall/README.md#L650).

That means the local deterministic pipeline is not the bottleneck. The real expensive part is the provider call behind it.

So for `frankenfirewall`, a Go rewrite only makes sense if you want it to become:

- a heavily internet-exposed, multi-tenant, high-RPS proxy
- with stricter connection management and lower per-request memory overhead
- and possibly a smaller deployment/runtime footprint

For the current codebase, the more urgent work is:

- auth
- quotas
- schema validation
- error hardening

**Conclusion:** keep the firewall in TS unless you are intentionally turning it into a high-volume standalone edge service.

### 3. `franken-orchestrator` would not meaningfully benefit from Go

This package is dominated by:

- LLM latency
- CLI subprocess latency
- git/gh command latency
- human approval latency

Examples:

- subprocess-heavy git operations in [`git-branch-isolator.ts`](/home/pfk/dev/frankenbeast/franken-orchestrator/src/skills/git-branch-isolator.ts)
- PR creation through `gh` in [`pr-creator.ts`](/home/pfk/dev/frankenbeast/franken-orchestrator/src/closure/pr-creator.ts)
- Martin/CLI execution flow in [`cli-skill-executor.ts`](/home/pfk/dev/frankenbeast/franken-orchestrator/src/skills/cli-skill-executor.ts)

Go would not make those operations materially faster because the dominant cost is external process and network behavior, not JavaScript runtime overhead.

Worse, rewriting the orchestration layer in Go would cost you:

- tighter TypeScript integration with the rest of the repo
- duplicated types and contracts
- more friction around existing SDKs and test harnesses

**Conclusion:** do not move orchestrator or chat logic to Go.

### 4. The best technical case for Go is a hardened subprocess/MCP daemon, not the whole MCP package

`franken-mcp` has two characteristics that make Go somewhat interesting:

- it manages long-lived subprocesses
- it handles untrusted tool-server stdout/stderr and env passing

Concrete issues today:

- raw stderr logging in [`stdio-transport.ts`](/home/pfk/dev/frankenbeast/franken-mcp/src/transport/stdio-transport.ts)
- broad env inheritance in [`stdio-transport.ts`](/home/pfk/dev/frankenbeast/franken-mcp/src/transport/stdio-transport.ts)
- incomplete public API / registry shape documented in [`008-franken-mcp-public-api-and-registry-are-incomplete.md`](/home/pfk/dev/frankenbeast/docs/issues/008-franken-mcp-public-api-and-registry-are-incomplete.md)

If you wanted a **security-driven** Go carve-out, this is the strongest one:

- a small Go daemon that owns subprocess spawning
- allowlisted env propagation
- explicit resource limits
- strict stdio framing
- optional sandboxing or privilege separation

That would be a real security/operability improvement because it creates a harder boundary around untrusted tool servers.

But rewriting the whole MCP client in Go is still probably wrong. The better split is:

- keep registry/config/tool selection in TS
- move only the dangerous process boundary into a hardened sidecar or daemon if needed

**Conclusion:** Go is justified here only as a narrow subprocess boundary, not as a blanket rewrite.

### 5. `franken-observer` is the strongest performance-driven Go candidate, but only if scale changes a lot

Today, `franken-observer` already benefits from:

- native SQLite via `better-sqlite3` in [`SQLiteAdapter.ts`](/home/pfk/dev/frankenbeast/franken-observer/src/adapters/sqlite/SQLiteAdapter.ts)
- batching support in [`BatchAdapter.ts`](/home/pfk/dev/frankenbeast/franken-observer/src/adapters/batch/BatchAdapter.ts)
- simple in-process metrics export in [`PrometheusAdapter.ts`](/home/pfk/dev/frankenbeast/franken-observer/src/adapters/prometheus/PrometheusAdapter.ts)

So a lot of the storage work is already either native or I/O-bound.

Where Go would help is if observer becomes:

- a central ingest service for many agents
- a high-cardinality metrics and trace API
- a long-lived dashboard backend serving many concurrent users

The current local `TraceServer` in [`TraceServer.ts`](/home/pfk/dev/frankenbeast/franken-observer/src/ui/TraceServer.ts) is not a reason to use Go. It is small, local-only, and currently needs security hardening and localhost binding more than runtime changes.

But if you want a real multi-tenant telemetry service, Go has real advantages:

- lower memory overhead under concurrency
- stronger story for a single static binary deployment
- strong suitability for HTTP ingest + metrics export + queue workers

**Conclusion:** keep current observer code in TS, but if you later build a production telemetry service, that service is a legitimate Go candidate.

### 6. `franken-governor` and `franken-critique` do not currently justify a Go rewrite

The existing server code is very small:

- critique API in [`app.ts`](/home/pfk/dev/frankenbeast/franken-critique/src/server/app.ts)
- governor API in [`app.ts`](/home/pfk/dev/frankenbeast/franken-governor/src/server/app.ts)

Their problems are:

- weak auth or no auth
- simplistic in-memory rate limiting
- incorrect signature handling
- no replay protection

Those are not runtime-language problems.

Go would only be worth considering if these become:

- externally exposed control-plane services
- high-volume webhook receivers
- independently deployed, multi-tenant products

Even then, the decision would be more about operational isolation than raw performance.

**Conclusion:** do not use Go here yet. Fix the security model first.

### 7. TypeScript is a better fit than Go for provider adapters and product-surface integrations

The codebase is leaning into:

- Hono
- Zod
- TypeScript-first contracts
- LLM/provider SDKs and adapter patterns

That makes TS the right default for:

- chat surface logic
- provider adapters
- OAuth/productivity integrations
- comms adapters
- dashboard UI/backend coordination

For those areas, Go would mostly create:

- duplicated schemas
- duplicated SDK handling
- more inter-process or inter-service glue

without delivering meaningful latency wins.

**Conclusion:** stay in TS for product and integration layers.

### 8. If you want Go anywhere, use it as a boundary-hardening tool, not as a “performance religion”

The codebase would benefit from Go only where one of these is true:

1. The component is internet-facing and concurrency-heavy
2. The component is acting as a hardened boundary around untrusted subprocesses
3. The component is becoming a standalone infrastructure service with strong operational isolation needs

That points to only a few serious candidates:

- a hardened MCP/process daemon
- a future standalone observer ingest/dashboard service
- possibly a future standalone high-throughput firewall edge proxy

It does **not** point to:

- orchestrator
- planner
- chat engine
- skills registry
- most provider integrations

---

## Candidate Matrix

| Area | Current bottleneck / risk | Would Go help? | Recommendation |
|---|---|---:|---|
| `frankenfirewall` | Auth, quotas, validation, edge hardening | Maybe later | Keep TS now; consider Go only for a true high-throughput edge deployment |
| `franken-governor` | Auth, signature verification, replay protection | Not meaningfully today | Keep TS |
| `franken-critique` | Small API, security hygiene, not CPU-bound | No | Keep TS |
| `franken-observer` local package | Mostly I/O/native SQLite, local tools | Not yet | Keep TS |
| `franken-observer` future central telemetry service | High ingest / dashboard concurrency | Yes | Valid future Go candidate |
| `franken-mcp` subprocess boundary | Env leakage, stderr leakage, process isolation | Yes, narrowly | Consider Go sidecar/daemon only |
| `franken-orchestrator` | External tools and LLM latency dominate | No | Keep TS |
| Chat / comms / productivity / dashboard product logic | SDK-heavy, schema-heavy, app logic | No | Keep TS |

---

## Recommended Actions

## Highest-value actions now

1. Harden the existing TS services before rewriting anything:

- governor auth and raw-body signature verification
- firewall auth, quotas, and boundary schemas
- critique auth and rate limiting
- localhost binding and optional auth for trace viewer
- MCP env allowlisting and stderr redaction

2. Do not rewrite orchestrator or chat in Go.

3. If you want one exploratory Go project, make it one of these:

- **Option A:** hardened MCP subprocess daemon
- **Option B:** future production observer ingest service

Those are the only places where the language change has a coherent technical case.

## What I would not approve

- “rewrite the backend in Go for security”
- “rewrite the orchestrator in Go for performance”
- “move the firewall to Go before fixing auth”

Those are not evidence-based moves on the current codebase.

---

## Bottom Line

Frankenbeast’s current problems are mostly **boundary correctness** problems, not **TypeScript runtime** problems.

If you want to use Go, use it surgically:

- for a hardened subprocess boundary
- or for a future dedicated high-throughput telemetry/edge service

For the rest of the system, TypeScript remains the better fit.

