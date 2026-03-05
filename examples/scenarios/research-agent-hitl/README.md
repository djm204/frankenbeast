# Research Agent with HITL Approval

Demonstrates Human-in-the-Loop (HITL) approval as a first-class primitive in the Frankenbeast framework. A research agent executes a series of tasks through the OllamaAdapter (local, free inference), pausing to request human approval when budget thresholds are crossed or when tasks are explicitly flagged as high-stakes.

## What This Demonstrates

### HITL as a First-Class Primitive

HITL approval is not bolted on after the fact -- it is woven into the task execution loop. Before any task runs, the budget gate evaluates two conditions:

1. **Task-level flag** -- Does the task have `requiresApproval: true`? High-stakes operations (e.g., tasks that access external data, trigger expensive models, or produce outputs that will be published) can be flagged individually.
2. **Budget threshold** -- Has the cumulative spend exceeded the configured `BUDGET_THRESHOLD`? This catches gradual cost accumulation that no single task would trigger.

When either condition fires, the agent pauses execution entirely and presents a CLI prompt to the human operator. The operator sees the reason, the current spend, and the task details before deciding to approve or deny.

### Budget Gates

The budget gate runs synchronously in the task loop -- there is no background execution while waiting for approval. This is intentional: the gate is a hard stop, not an advisory. If the human denies approval, the task is skipped and marked with the denial reason. Subsequent tasks still run through the gate independently.

In production, budget gates map to the Governor's `BudgetTrigger` and `TokenBudgetBreaker` components. The `BudgetTrigger` fires when cumulative cost crosses a threshold; the `TokenBudgetBreaker` halts execution when token budgets are exhausted. Both feed into the `ApprovalGateway`, which routes approval requests through configured channels.

### Governor Approval Flow

This scenario's `requestApproval` function is a simplified version of the Governor's approval pipeline:

```
Task loop --> Budget gate check --> ApprovalGateway --> Channel (CLI/Slack/API) --> Human decision
                                         |
                                         v
                                   Skip or Execute
```

In the full framework:

- **ApprovalGateway** -- Routes approval requests to the configured channel and enforces timeouts. If no response arrives within the timeout window, the default policy (deny) applies.
- **CliChannel** -- The channel used here. Reads from stdin via `readline/promises`. In production, this is one of several channel implementations (CLI, Slack webhook, HTTP callback).
- **BudgetTrigger** -- Evaluates whether the current spend or token count has crossed a configured threshold. Unlike this scenario's simple `totalSpend > threshold` check, the real trigger supports per-task budgets, per-session budgets, and rate-based limits.

### OllamaAdapter for Local Inference

The scenario uses the `OllamaAdapter` from `frankenfirewall` to make LLM calls against a locally running Ollama instance. This means:

- No API keys required
- Zero cost (Ollama runs local models)
- The full IAdapter pipeline is exercised: `transformRequest` -> `execute` -> `transformResponse`
- Token counts and cost metrics are tracked through the `UnifiedResponse` schema, even though cost is $0.00

## Research Tasks

| Task | Description | Requires Approval |
|------|-------------|-------------------|
| Literature survey | Summarize recent advances in transformer architectures | No |
| Methodology comparison | Compare knowledge distillation vs quantization | No |
| Deep analysis with external data | Analyze fine-tuning vs RAG trade-offs | Yes |

Task 3 is flagged with `requiresApproval: true` to simulate a high-cost or high-stakes operation that should not proceed without human oversight.

## Prerequisites

- Node.js 18+
- [Ollama](https://ollama.ai) installed and running locally
- A model pulled (e.g., `ollama pull llama3.2`)

## Configuration

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `llama3.2` | Model to use for inference |
| `BUDGET_THRESHOLD` | `0.00` | USD threshold before requiring HITL approval |

## Run

```bash
npm start
```

## Expected Behavior

1. Tasks 1 and 2 execute without approval prompts (no `requiresApproval` flag, spend is $0.00 which does not exceed the $0.00 threshold since the check is strictly greater-than).
2. Task 3 triggers the HITL approval prompt because it has `requiresApproval: true`.
3. If you approve task 3, it executes and the summary shows 3 completed tasks.
4. If you deny task 3, it is skipped and the summary shows 2 completed, 1 skipped.

```
=== Research Agent with HITL Approval ===

This scenario uses OllamaAdapter for local LLM inference.
HITL approval is triggered when:
  1. A task has requiresApproval: true
  2. Total spend exceeds the budget threshold ($0.00)

Ollama endpoint: http://localhost:11434
Model: llama3.2
Budget threshold: $0.00

-------------------------------------------
Task [task-1]: Literature survey
  Requires approval: false

  Sending prompt to Ollama...
  Response (... tokens):
    ...

-------------------------------------------
Task [task-2]: Methodology comparison
  Requires approval: false

  Sending prompt to Ollama...
  Response (... tokens):
    ...

-------------------------------------------
Task [task-3]: Deep analysis with external data
  Requires approval: true

========================================
  HUMAN-IN-THE-LOOP APPROVAL REQUIRED
========================================
Reason: Task "Deep analysis with external data" is flagged as requiring human approval
Details: {
  "taskId": "task-3",
  "taskName": "Deep analysis with external data",
  "flag": "requiresApproval",
  "currentTotalSpend": "$0.000000",
  "budgetThreshold": "$0.000000"
}
Approve this action? (y/n): y

  Sending prompt to Ollama...
  Response (... tokens):
    ...

===========================================
  RESEARCH AGENT SUMMARY
===========================================

  Tasks completed: 3
  Tasks skipped (denied): 0
  Total spend: $0.000000
  Budget threshold: $0.000000

--- Task Details ---
  [DONE] task-1: Literature survey
         Tokens: ... in / ... out | Cost: $0.000000
  [DONE] task-2: Methodology comparison
         Tokens: ... in / ... out | Cost: $0.000000
  [DONE] task-3: Deep analysis with external data
         Tokens: ... in / ... out | Cost: $0.000000
```
