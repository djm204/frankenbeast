# Contract Matrix: Cross-Module Port Interfaces

> Catalogs every port interface, its defining module, consuming module(s), and structural compatibility status.

## Port Interfaces

Module numbers (MOD-01..MOD-08) refer to logical capabilities. Since the package consolidation there are no standalone firewall (MOD-01), skills (MOD-02), or heartbeat (MOD-08) packages — those capabilities live inside `@franken/orchestrator`. The orchestrator's Beast Loop ports (`IFirewallModule`, `ISkillsModule`, `IMemoryModule`, `IPlannerModule`, `IObserverModule`, `ICritiqueModule`, `IGovernorModule`, `IHeartbeatModule`, `IMcpModule`) are all defined in `packages/franken-orchestrator/src/deps.ts`. (`IObservabilityModule` and `IHitlGateway` do not exist; the observer and governor ports are `IObserverModule` and `IGovernorModule`.) The current source imports Zod from `zod`; no separate Zod import-path split is tracked here.

| Port Interface | Defining Module | Consuming Module(s) | Structural Match? |
|---|---|---|---|
| `IAdapter` | Orchestrator (`@franken/orchestrator/src/adapters/adapter-llm-client.ts`) | Orchestrator LLM wiring (`CliLlmAdapter`, `AdapterLlmClient`) | Yes |
| `ILlmClient` | `@franken/types` (`src/llm.ts`) | Orchestrator planning/closure/adapters | Yes |
| `IResultLlmClient` | `@franken/types` (`src/llm.ts`) | Result-shaped LLM callers | Yes |
| `GuardrailsModule` | MOD-04 planner (`src/modules/mod01.ts`) | Firewall-capability impl (orchestrator security middleware) | Needs adapter |
| `SkillsModule` | MOD-04 planner (`src/modules/mod02.ts`) | Skills-capability impl (orchestrator skill manager) | Needs adapter |
| `MemoryModule` | MOD-04 planner (`src/modules/mod03.ts`) | MOD-03 brain impl | Needs adapter |
| `SelfCritiqueModule` | MOD-04 planner (`src/modules/mod07.ts`) | `@franken/governor` via `GovernorCritiqueAdapter.verifyRationale(...)` | Resolved for shared `TaskId`, `RationaleBlock`, and `VerificationResult` via `@franken/types`; still adapter-shaped |
| `GuardrailsPort` | MOD-06 critique (`src/types/contracts.ts`) | Wired with an inline all-pass stub in `dep-factory.ts` | Needs real impl |
| `MemoryPort` | MOD-06 critique (`src/types/contracts.ts`) | Wired with an inline no-op stub in `dep-factory.ts` | Needs real impl |
| `ObservabilityPort` | MOD-06 critique (`src/types/contracts.ts`) | `CliObserverBridge.getTokenSpend` (real) | Yes |
| `EscalationPort` | MOD-06 critique (`src/types/contracts.ts`) | MOD-07 governor impl | Needs adapter |
| `GovernorMemoryPort` | MOD-07 governor (`src/audit/governor-memory-port.ts`) | MOD-03 brain impl | Needs adapter |
| `ApprovalChannel` | MOD-07 governor (`src/gateway/approval-channel.ts`) | `CliChannel` (CLI impl) | Yes |
| `IFirewallModule` | Orchestrator (`src/deps.ts`) | `MiddlewareChainFirewallAdapter` | Yes — adapter shipped |
| `ISkillsModule` | Orchestrator (`src/deps.ts`) | `SkillManagerAdapter` | Yes — adapter shipped |
| `IMemoryModule` | Orchestrator (`src/deps.ts`) | `SqliteBrainMemoryAdapter` (over `@franken/brain`) | Yes — adapter shipped |
| `IPlannerModule` | Orchestrator (`src/deps.ts`) | `stubPlanner` in the default local CLI graph-builder path; shipped implementations include `LlmPlanner` and `PlannerPortAdapter` | Stubbed in default CLI graph-builder wiring; adapters shipped |
| `IObserverModule` | Orchestrator (`src/deps.ts`) | `AuditTrailObserverAdapter` / observer bridge | Yes — adapter shipped |
| `ICritiqueModule` | Orchestrator (`src/deps.ts`) | `CritiquePortAdapter` (over `@franken/critique`) | Yes — adapter shipped |
| `IGovernorModule` | Orchestrator (`src/deps.ts`) | `GovernorPortAdapter` (over `ApprovalGateway`) | Yes — adapter shipped |
| `IHeartbeatModule` | Orchestrator (`src/deps.ts`) | `ReflectionHeartbeatAdapter` | Yes — adapter shipped |
| `IMcpModule` | Orchestrator (`src/deps.ts`) | `McpSdkAdapter` | Adapter shipped; fail-closed until an MCP transport is configured |

## Resolved Type Mismatches

These items were previously listed under “Type Mismatches Requiring Resolution”, but the live source now resolves them through `@franken/types` shared exports.

### 1. TaskId Branding
- **Former mismatch**: Planner used branded `TaskId`; critique/governor used plain `string` values in cross-module contracts.
- **Canonical source**: `packages/franken-types/src/ids.ts` exports branded `TaskId` and `createTaskId()`.
- **Adopters**: Critique, governor, and planner import or re-export the shared type where their current cross-module contracts require it.
- **Status**: Resolved.

### 2. Severity Scale Divergence
- **Former mismatch**: Critique, governor, and heartbeat used overlapping but incompatible severity unions.
- **Canonical source**: `packages/franken-types/src/severity.ts` exports the `Severity` superset plus module-specific `CritiqueSeverity`, `TriggerSeverity`, and `FlagSeverity` subsets.
- **Status**: Resolved.

### 3. RationaleBlock Duplication
- **Former mismatch**: Planner and governor carried separate `RationaleBlock`/verification shapes.
- **Canonical source**: `packages/franken-types/src/rationale.ts` exports `RationaleBlock` and `VerificationResult`.
- **Status**: Resolved.

### 4. ILlmClient Return Type Divergence
- **Former mismatch**: Brain-style LLM clients returned `Promise<string>` while heartbeat-style clients returned `Promise<Result<string>>`.
- **Canonical source**: `packages/franken-types/src/llm.ts` exports both `ILlmClient` and `IResultLlmClient` so the two call shapes are explicit instead of conflicting.
- **Status**: Resolved.

## Remaining Type Mismatches Requiring Resolution or Adapter Boundaries

### 1. EpisodicTrace Module Projections
- **Brain** (`packages/franken-types/src/brain.ts:42-49`, persisted by `packages/franken-brain/src/sqlite-brain.ts`): `summary`/`details` episodic event fields
- **Critique** (`franken-critique/src/types/contracts.ts:28-33`): `summary`/`outcome` fields
- **Governor** (`franken-governor/src/audit/governor-memory-port.ts:1-12`): `toolName`/`tags` fields
- **Resolution**: Each module keeps its own projection (different shapes serve different purposes). Document that these are intentional views, not duplicates.

### 2. Zod Runtime Boundary
- **Current source**: packages import from `zod`; no separate Zod import-path split is present.
- **Resolution**: Cross-module contracts use shared TypeScript types from `@franken/types` instead of passing Zod schema instances across package boundaries.
