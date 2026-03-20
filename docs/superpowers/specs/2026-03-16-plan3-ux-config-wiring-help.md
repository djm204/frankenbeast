# Plan 3: UX — Config Wiring, Dashboard Accuracy, Help Docs

**Date:** 2026-03-16
**Status:** Approved
**Depends on:** Plan 1 (Foundation) for config passthrough, Plan 2 (Management) for beast daemon + SSE

---

## Problem Statement

The frontend wizard collects detailed agent configuration across 8 steps but serializes it as an opaque blob. The dashboard detail panel shows hardcoded placeholder text regardless of actual config. The frontend polls every 4 seconds instead of consuming SSE. No help documentation exists for either CLI or dashboard agent workflows.

---

## Section 1: Wizard Config Mapping to Typed API Payload

### Current State

`ChatShell.onLaunch` extracts `workflow.workflowType` as `definitionId` and packs the entire wizard config as `initConfig` — an untyped `Record<string, unknown>`. The typed fields on `ExtendedAgentCreateInput` (`llmConfig`, `moduleConfig`, `gitConfig`, `skills`) exist but are never populated.

### Design

New function `buildAgentCreatePayload(wizardConfig)` in a separate file `build-agent-payload.ts`. This function receives the config object assembled by `WizardDialog.buildAndLaunch()`, which uses `SECTION_KEYS` as top-level keys — **not** array indices:

```
config.identity  (name, description)
config.workflow  (workflowType, chunkDir, docPath, etc.)
config.llm       (defaultProvider, defaultModel, overrides)
config.modules   (per-module booleans + deep config)
config.skills    (selectedSkills: string[])
config.prompts   (promptText, files)
config.git       (preset, baseBranch, branchPattern, etc.)
```

The function **reshapes** these into the typed API payload:

| Source field | Transform | Target field |
|---|---|---|
| `config.workflow.workflowType` | Direct map | `definitionId` |
| `config.workflow` | Via existing `buildInitAction()` | `initAction` |
| `config.identity.name`, `.description` | Direct map | `name`, `description` |
| `config.llm.defaultProvider`, `.defaultModel` | Reshape to nested | `llmConfig.default: { provider, model }` |
| `config.llm.overrides` | Filter out `useDefault` flags, reshape | `llmConfig.overrides: { planning?: {...}, ... }` |
| `config.modules` | Direct map | `moduleConfig: { firewall: bool, ... }` |
| `config.skills.selectedSkills` | Extract inner array | `skills: string[]` |
| `config.prompts.promptText`, `.files` | Rename | `promptConfig: { text, files }` |
| `config.git` | Direct map | `gitConfig: { preset, ... }` |

**Note:** `StepReview` has its own `handleLaunch()` that uses `SECTION_LABELS[i].toLowerCase().replace(/ /g, '_')` as keys, producing `llm_targets` instead of `llm`. Both launch paths must produce the same keyed shape. Fix: normalize `StepReview.handleLaunch()` to use `SECTION_KEYS` (matching `WizardDialog.buildAndLaunch()`) before passing to `onLaunch`.

**API client update:** `BeastApiClient.createAgent()` currently accepts `{ definitionId, initAction, initConfig }` — an older shape. **This method must be updated** to accept the `ExtendedAgentCreateInput` type (which already exists in `beast-api.ts` lines 113-125 but is unused). The old `initConfig` bag is replaced by the typed fields.

The `POST /v1/beasts/agents` call (now to the beast daemon) sends this structured payload. The daemon validates it against the definition's `configSchema` + extended fields and stores it as the `configSnapshot` on the `BeastRun`.

### Files

- **Modify:** `packages/franken-web/src/components/chat-shell.tsx` (replace onLaunch handler, update `beastClient` construction to use `VITE_BEAST_DAEMON_URL` for beast operations)
- **Modify:** `packages/franken-web/src/lib/beast-api.ts` (update `createAgent()` to accept `ExtendedAgentCreateInput` instead of the legacy `{ definitionId, initAction, initConfig }` shape)
- **Modify:** `packages/franken-web/src/components/beasts/steps/step-review.tsx` (normalize `handleLaunch()` to use `SECTION_KEYS` matching `WizardDialog.buildAndLaunch()`)
- **Create:** `packages/franken-web/src/lib/build-agent-payload.ts` (pure function, testable)
- **Test:** `packages/franken-web/src/lib/__tests__/build-agent-payload.test.ts`

---

## Section 2: Agent Detail Panel Shows Real Config

### Current State

`AgentDetailReadonly` shows hardcoded placeholder strings for LLM Configuration, Skills, Prompt Frontloading, and Git Workflow sections — regardless of what the wizard submitted. (Note: the Modules section is already partially dynamic — it reads `agent.moduleConfig` and renders enabled/disabled badges. It only needs extension for deep config display.)

### Design

The agent detail endpoint (`GET /v1/beasts/agents/:id`) returns the `TrackedAgent` record including `initConfig`. Once Section 1 populates the typed fields, the response has structured data to render.

**Changes per accordion section in `AgentDetailReadonly`:**

- **LLM Configuration:** Read `agent.initConfig.llmConfig`. Show default provider/model. If overrides exist, show table: `Planning → claude-opus-4-6, Execution → claude-sonnet-4-6`. Fallback to "Using process defaults" only if `llmConfig` is genuinely absent.

- **Modules:** Already shows enabled/disabled badges. Extend: if deep config exists (e.g., `critique.maxIterations: 5`), show key-value pairs under each module badge.

- **Skills:** Read `agent.initConfig.skills`. Render as chip list. Fallback to "No skills selected" only if empty array.

- **Prompts:** Read `agent.initConfig.promptConfig`. Show truncated prompt text (first 200 chars + "...") and file list with token counts. Fallback only if genuinely empty.

- **Git Workflow:** Read `agent.initConfig.gitConfig`. Show preset name as badge, then concrete settings (base branch, PR creation, merge strategy). Fallback only if absent.

**Pattern:** Each section checks if the typed field exists, renders it if so, shows fallback text only as a genuine "not configured" state.

### Files

- **Modify:** `packages/franken-web/src/components/beasts/agent-detail-readonly.tsx`
- **Test:** Component tests verifying real config renders correctly and fallbacks show when absent

---

## Section 3: Dashboard Consumes SSE Instead of Polling

### Current State

`ChatShell` has a polling `useEffect` (lines ~178-242) that fires every 4 seconds. It fetches catalog + agent list in parallel, then chains detail + run + logs fetches. The effect also re-runs when `selectedBeastAgentId` changes (it's in the dependency array), cancelling and restarting the interval on every agent selection click. Wasteful, introduces latency, and can miss rapid state transitions.

**Blocking dependency:** This section requires Plan 2's beast daemon to be running with the SSE endpoints (`GET /v1/beasts/events/stream`, `POST /v1/beasts/events/ticket`) live. The hook cannot be implemented or tested until Plan 2 Section 1 (daemon + SSE routes) is complete. Sections 1, 2, and 4 of this plan can proceed independently.

### Design

**New React hook: `useBeastEventStream(daemonUrl, operatorToken)`**

Located in `packages/franken-web/src/hooks/use-beast-event-stream.ts`.

**Connection flow:**

1. On mount: `POST ${daemonUrl}/v1/beasts/events/ticket` with bearer token → `{ ticket }`
2. Open `EventSource` to `${daemonUrl}/v1/beasts/events/stream?ticket=${ticket}`
3. On `snapshot` event: set full agent list state
4. On `agent.status` event: update specific agent in-place
5. On `agent.event` event: append to selected agent's event list
6. On `run.log` event: append to log viewer
7. On disconnect: auto-reconnect (native `EventSource` behavior), re-request ticket on 401

**Hook API:**

```typescript
const {
  agents,              // TrackedAgentSummary[]
  selectedAgentDetail, // TrackedAgentDetail | null (updates live)
  logs,                // Map<runId, string[]>
  connectionStatus,    // 'connecting' | 'connected' | 'reconnecting' | 'error'
  selectAgent,         // (agentId: string) => void
} = useBeastEventStream(daemonUrl, operatorToken);
```

**What gets removed from `ChatShell`:**

- The 4-second polling `useEffect`
- `beastAgents`, `beastAgentDetail` React state (replaced by hook)
- The chained `GET` fetches for catalog/agents/detail/run/logs
- `beastRefreshNonce` state

**What stays:**

- `GET /v1/beasts/catalog` — fetched once on mount (catalog is static)
- Write operations (`POST` start/stop/restart/kill/delete) — remain as HTTP calls to daemon API. On success, the SSE stream delivers the state update (no manual refresh needed).

**Dashboard URL configuration:**

`VITE_BEAST_DAEMON_URL` env var in `packages/franken-web/.env`. The dashboard talks directly to the beast daemon — not through the chat-server. **This also requires updating `BeastApiClient` construction in `ChatShell`**: currently `beastClient` is instantiated with the chat-server's `baseUrl` (passed as `ChatShellProps.baseUrl`). All beast CRUD operations (`createAgent`, `stopAgent`, etc.) must use `VITE_BEAST_DAEMON_URL` instead. The SSE hook uses the daemon URL independently. This means `ChatShell` needs two base URLs: one for chat (chat-server) and one for beasts (daemon).

**`selectAgent` must not cause reconnection:** The current polling `useEffect` re-runs on `selectedBeastAgentId` changes. The SSE hook's `selectAgent(agentId)` must update which agent's detail is tracked without closing/reopening the EventSource connection — it's a client-side filter change, not a server-side subscription change.

### Files

- **Create:** `packages/franken-web/src/hooks/use-beast-event-stream.ts`
- **Modify:** `packages/franken-web/src/components/chat-shell.tsx` (replace polling with hook)
- **Modify:** `packages/franken-web/.env` (add `VITE_BEAST_DAEMON_URL`)
- **Test:** `packages/franken-web/src/hooks/__tests__/use-beast-event-stream.test.ts`

---

## Section 4: Help Docs — CLI and Frontend

### Design

**CLI help:**

- `frankenbeast beasts --help` prints usage summary with all subcommands, flags, and examples
- Each subcommand has its own `--help`: `beasts spawn --help`, `beasts list --help`, etc.
- Implemented via arg parser metadata: `description` and `examples` fields on each subcommand definition in `args.ts`

**Guide document:**

New `docs/guides/launch-and-manage-agents.md` covering:

- Starting the beast daemon (`network up` or lazy start)
- Launching from CLI with `--params` and interactive mode
- Launching from dashboard wizard (step-by-step)
- Monitoring agents (CLI `beasts status/logs`, dashboard detail panel)
- Stopping, restarting, deleting agents
- Multi-agent concurrency and git worktree isolation
- Troubleshooting: daemon not running, stale processes, config errors

**Frontend contextual help:**

- Each wizard step gets a `helpText` prop — short sentence below the step title explaining what this step configures
- Step 7 (Review) is architecturally different: `StepReview` has its own `handleLaunch()` and renders a summary, not a form. The "What happens next?" blurb is implemented directly inside `StepReview` (not via a prop from `WizardDialog`) since it's a static informational block specific to the review step
- "Learn more" link in wizard header points to the guide doc

### Files

- **Modify:** `packages/franken-orchestrator/src/cli/args.ts` (help text metadata)
- **Create:** `docs/guides/launch-and-manage-agents.md`
- **Modify:** `packages/franken-web/src/components/beasts/wizard-dialog.tsx` (help text props)
- **Modify:** `packages/franken-web/src/components/beasts/steps/step-*.tsx` (per-step help text)

---

## Testing Strategy

- Unit tests for `buildAgentCreatePayload` (pure function)
- Component tests for `AgentDetailReadonly` rendering real config vs fallbacks
- Unit tests for `useBeastEventStream` hook (mock EventSource)
- Integration test: wizard submit → daemon receives typed payload → spawned process gets config
- All existing tests must continue to pass
