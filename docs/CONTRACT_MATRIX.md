# Contract Matrix: Cross-Module Port Interfaces

> Catalogs every port interface, its defining module, consuming module(s), and structural compatibility status.

## Port Interfaces

| Port Interface | Defining Module | Consuming Module(s) | Structural Match? |
|---|---|---|---|
| `IAdapter` | MOD-01 firewall | Orchestrator | Yes |
| `ISkillRegistry` | MOD-02 skills | MOD-04 planner (via `SkillsModule`) | Needs adapter |
| `ILlmClient` (brain) | MOD-03 brain | MOD-03 internal | Yes |
| `ILlmClient` (heartbeat) | MOD-08 heartbeat | MOD-08 internal | Resolved via `IResultLlmClient` projection |
| `GuardrailsModule` | MOD-04 planner | MOD-01 firewall impl | Yes |
| `SkillsModule` | MOD-04 planner | MOD-02 skills impl | Needs adapter |
| `MemoryModule` | MOD-04 planner | MOD-03 brain impl | Needs adapter |
| `SelfCritiqueModule` | MOD-04 planner | MOD-07 governor impl | Resolved for shared `TaskId` via `@franken/types`; still adapter-shaped |
| `GuardrailsPort` | MOD-06 critique | MOD-01 firewall impl | Needs adapter |
| `MemoryPort` | MOD-06 critique | MOD-03 brain impl | Needs adapter |
| `ObservabilityPort` | MOD-06 critique | MOD-05 observer impl | Needs adapter |
| `EscalationPort` | MOD-06 critique | MOD-07 governor impl | Needs adapter |
| `GovernorMemoryPort` | MOD-07 governor | MOD-03 brain impl | Needs adapter |
| `ApprovalChannel` | MOD-07 governor | CLI/Slack channel impl | Yes |
| `IMemoryModule` | MOD-08 heartbeat | MOD-03 brain impl | Needs adapter |
| `IObservabilityModule` | MOD-08 heartbeat | MOD-05 observer impl | Needs adapter |
| `IPlannerModule` | MOD-08 heartbeat | MOD-04 planner impl | Needs adapter |
| `ICritiqueModule` | MOD-08 heartbeat | MOD-06 critique impl | Needs adapter |
| `IHitlGateway` | MOD-08 heartbeat | MOD-07 governor impl | Needs adapter |

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

### 1. EpisodicTrace Quadruple-Definition
- **Brain** (`franken-brain/src/types/memory.ts:46-54`): Zod-backed, `input`/`output` fields
- **Critique** (`franken-critique/src/types/contracts.ts:28-33`): `summary`/`outcome` fields
- **Governor** (`franken-governor/src/audit/governor-memory-port.ts:1-12`): `toolName`/`tags` fields
- **Heartbeat** (`franken-heartbeat/src/modules/memory.ts:5-11`): `summary`/`timestamp` fields
- **Resolution**: Each module keeps its own projection (different shapes serve different purposes). Document that these are intentional views, not duplicates.

### 2. Zod Version Split
- **Heartbeat**: `zod/v4` (Zod 4.x import path)
- **Critique**: `zod` 3.24.x
- **Resolution**: `@franken/types` uses Zod 4. Critique continues with Zod 3 internally. Shared types avoid Zod runtime validation at the boundary (use TypeScript types only for cross-module contracts).
