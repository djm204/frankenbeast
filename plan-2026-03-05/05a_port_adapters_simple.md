# Chunk 05a: Port Adapters — Simple Modules

## Objective

Create bridge adapters for the simpler modules: Firewall, Memory (MVP), Observer, Governor, Heartbeat. These are thin translation layers with minimal logic.

## Files

- Create: `franken-orchestrator/src/adapters/firewall-adapter.ts`
- Create: `franken-orchestrator/src/adapters/memory-adapter.ts`
- Create: `franken-orchestrator/src/adapters/observer-adapter.ts`
- Create: `franken-orchestrator/src/adapters/governor-adapter.ts`
- Create: `franken-orchestrator/src/adapters/heartbeat-adapter.ts`
- Create: `franken-orchestrator/tests/unit/adapters/firewall-adapter.test.ts`
- Create: `franken-orchestrator/tests/unit/adapters/memory-adapter.test.ts`
- Create: `franken-orchestrator/tests/unit/adapters/observer-adapter.test.ts`
- Create: `franken-orchestrator/tests/unit/adapters/governor-adapter.test.ts`
- Create: `franken-orchestrator/tests/unit/adapters/heartbeat-adapter.test.ts`

## Context — What Each Real Module Exposes

**MOD-01 Firewall**: `frankenfirewall/src/pipeline/pipeline.ts` exports `runPipeline(request, adapter, config, options?)`. `IAdapter` interface: `transformRequest`, `execute`, `transformResponse`, `validateCapabilities`.

**MOD-03 Brain**: `franken-brain/src/orchestrator/memory-orchestrator.ts` — `MemoryOrchestrator` with `frontload(projectId)`, `getContext()`, `recordToolResult(trace)`. For MVP: use an in-memory implementation that stores traces in an array and returns static context.

**MOD-05 Observer**: `franken-observer/src/core/TraceContext.ts` — static methods `createTrace`, `startSpan`, `endSpan`. `CostCalculator` for token costs.

**MOD-07 Governor**: `franken-governor/src/gateway/approval-gateway.ts` — `ApprovalGateway` with `requestApproval(request)`. `CliChannel` for interactive approval.

**MOD-08 Heartbeat**: `franken-heartbeat/src/orchestrator/pulse-orchestrator.ts` — `PulseOrchestrator` with `run()`.

## Success Criteria

- [ ] `FirewallPortAdapter` implements `IFirewallModule` — wraps a firewall `IAdapter`, calls `transformRequest → execute → transformResponse`, returns `FirewallResult`
- [ ] `FirewallPortAdapter` maps adapter violations to `FirewallViolation` format
- [ ] `MemoryPortAdapter` implements `IMemoryModule` — MVP in-memory store (array of traces, static context from config)
- [ ] `ObserverPortAdapter` implements `IObserverModule` — wraps `TraceContext` static methods
- [ ] `GovernorPortAdapter` implements `IGovernorModule` — wraps `ApprovalGateway`, auto-approves non-HITL tasks
- [ ] `GovernorPortAdapter` constructor takes optional `defaultDecision` for CLI auto-approve mode
- [ ] `HeartbeatPortAdapter` implements `IHeartbeatModule` — wraps `PulseOrchestrator.run()`, translates result
- [ ] Unit tests for each adapter (mock the underlying module)
- [ ] TypeScript compiles

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/adapters/
```

## Hardening Requirements

- Each adapter is a thin translation layer — no business logic
- Adapters must handle errors from underlying modules and wrap them appropriately
- MVP `MemoryPortAdapter` uses in-memory arrays — will be swapped for real `MemoryOrchestrator` later
- `GovernorPortAdapter('approved')` auto-approves everything (CLI mode, no interactive HITL in v1)
- All adapters must be constructable with dependency injection (no global state)
