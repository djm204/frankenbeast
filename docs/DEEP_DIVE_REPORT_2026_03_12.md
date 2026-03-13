# Deep Dive Codebase Review — March 12, 2026

## Overview
This report identifies dead code, architectural gaps, and redundant logic within the Frankenbeast monorepo. The primary finding is that while the core `BeastLoop` logic is robust, it is currently running on "Passthrough Stubs" in the production CLI path, leaving several specialized packages underutilized.

---

## 1. The "Passthrough Stubs" (Architectural Gaps)
In `packages/franken-orchestrator/src/cli/dep-factory.ts`, several core modules required by the `BeastLoop` are currently stubbed. This renders the orchestrator logic that interacts with these modules effectively "dead" in the production CLI path:

| Module | Stub Name | Impact |
| :--- | :--- | :--- |
| **Firewall (MOD-01)** | `stubFirewall` | No PII masking or prompt injection scanning. Logic in `runIngestion` is a no-op. |
| **Memory (MOD-03)** | `stubMemory` | No long-term storage of ADRs or failure history. `runHydration` has no data to inject. |
| **Critique (MOD-06)** | `stubCritique` | Plans always "pass" with a score of 1.0. The reflective planning loop is bypassed. |
| **Governor (MOD-07)** | `stubGovernor` | All actions are auto-approved. Human-in-the-loop triggers in the main loop never fire. |
| **Heartbeat (MOD-08)** | `stubHeartbeat` | No post-execution reflection or tech-debt analysis is performed. |
| **Skills (MOD-02)** | `createStubSkills` | Bypasses the skill registry. Assumes all tasks are `cli` tasks, ignoring pluggable functions/MCP. |

---

## 2. Redundant & Dead Code in Orchestrator
The following symbols are defined but currently serve no purpose or have been superseded:

### `packages/franken-orchestrator/src/cli/session.ts`
*   **`extractChunkDefinitions`**: This method is defined but never invoked. It appears to be a leftover from an earlier iteration of the planning pipeline.

### `packages/franken-orchestrator/src/issues/issue-runner.ts`
*   **`issueCompletionKey`**: This creates a key like `taskId:done`. However, the standard `FileCheckpointStore` uses simple `taskId` keys. This results in issue-specific checkpoints being isolated and incompatible with the main loop's recovery logic.
*   **`createIssueSkills` / `createIssueCliExecutor`**: These represent a "middleware" layer that manually overrides defaults. Since issues now run through the standard `BeastLoop`, these could be refactored into cleaner decorator patterns or replaced with standard dependency configuration.

---

## 3. Ghost Packages (Zero/Low Integration)
These packages are implemented and tested in the monorepo but are **not connected** to the primary `frankenbeast` CLI:

*   **`franken-brain`**: Contains sophisticated episodic and semantic memory logic. Currently replaced by `stubMemory`.
*   **`franken-comms`**: Implements socket bridges. The orchestrator's `chat-server` has implemented its own `ws-chat-server.ts`, leading to duplication of transport logic.
*   **`franken-planner`**: Implements specialized strategies (Chain-of-Thought, Parallel). The CLI hardcodes `LlmGraphBuilder` and `ChunkFileGraphBuilder`, ignoring this package's more advanced strategies.
*   **`frankenfirewall`**: A feature-complete firewall with regex and PII filters that remains unused in favor of `stubFirewall`.

---

## 4. Rare & Redundant Utilities
*   **`packages/franken-orchestrator/src/cli/upstream-repo.ts`**: This utility is only reachable when the `--target-upstream` flag is used. In typical workflows, the repository is inferred via `IssueFetcher`, making this a rarely exercised path that could be merged into `IssueFetcher`.

---

## Recommendations
1.  **Phase 8 Focus**: Prioritize "Stub Replacement" over code deletion. The goal should be to wire `frankenfirewall`, `franken-brain`, and `franken-critique` into `dep-factory.ts`.
2.  **Unify Transport**: Converge `franken-comms` and the orchestrator's internal WebSocket server to reduce maintenance surface.
3.  **Checkpoint Alignment**: Standardize the checkpoint key format in `IssueRunner` to match the rest of the system, ensuring `issue-89` style fixes can be resumed by any `frankenbeast` command.
