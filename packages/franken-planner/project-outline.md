# Module 04: Planning and Decomposition (The Executive)

## 1. Overview

MOD-04 is responsible for high-level reasoning. It takes a complex goal (e.g., "Implement Multi-Currency UI for Staples") and decomposes it into a sequence of actionable sub-tasks. It ensures the agent doesn't "hallucinate spirals" by maintaining a structured state of progress.

## 2. The Planning Logic

### 2.1 Task Decomposition (The DAG)

The Planner converts a user prompt into a **Directed Acyclic Graph (DAG)** of tasks. Each task includes:

- **Objective:** What needs to be achieved.
- **Required Skills:** Which tools from `@djm204/agent-skills` are needed.
- **Dependencies:** Which tasks must be completed first (e.g., "Define Schema" before "Generate Component").

### 2.2 Dynamic Replanning

If a task fails or a **Guardrail (MOD-01)** blocks an action, the Planner does not quit. It ingests the error from **Episodic Memory (MOD-03)** and generates a "Recovery Plan."

### 2.3 Chain-of-Thought (CoT) Enforcement

Before selecting a tool, the Planner must output a "Rationale" block. This allows the **Self-Critique (MOD-07)** module to verify the agent's logic _before_ execution.

## 3. Planning Strategies

| Strategy      | When to Use                                                                                      |
| :------------ | :----------------------------------------------------------------------------------------------- |
| **Linear**    | Simple, sequential tasks (e.g., "Update dependencies and run tests").                            |
| **Parallel**  | Independent tasks that can run in a multi-agent setup (e.g., "Generate 5 different unit tests"). |
| **Recursive** | Complex refactoring where the output of one step defines the scope of the next.                  |

## 4. Integration with the "Frankenbeast"

- **Input:** Sanitized intent from **MOD-01**.
- **Context:** ADRs and project rules pulled from **MOD-03 Semantic Memory**.
- **Tooling:** Available capabilities discovered via **MOD-02 (@djm204/agent-skills)**.

## 5. Human-in-the-Loop (HITL) Integration

For "0 to 1" builds, the Planner will pause and present the **Master Plan** to the user for approval.

- **Wait State:** The system exports the plan as a Markdown checklist.
- **Confirmation:** The user can say "Proceed," "Modify Task 2," or "Abort."

## 6. Self-Correction Loop

If the execution of a task results in a stack trace or build error:

1. The Planner analyzes the error.
2. It queries **MOD-03** to see if this is a known issue.
3. It inserts a "Fix-it" sub-task into the current DAG and re-executes.
