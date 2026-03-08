# Module 05: Observability and Evaluation (AgentOps)

## 1. Overview
MOD-05 provides the "Flight Data Recorder" for the Frankenbeast. It captures every trace, monitors token burn-rates in real-time, and runs "Agent Unit Tests" (Evals) to ensure that code refactors don't break established skills.

## 2. Real-Time Tracing (The Trace-Map)
Traditional logging is insufficient for agents. MOD-05 implements **Hierarchical Tracing**:
- **Root Trace:** The high-level user goal.
- **Spans:** Individual steps taken by the **Planner (MOD-04)**.
- **Sub-Spans:** Each call to a tool in `@djm204/agent-skills` or an LLM adapter in **MOD-01**.
- **Metadata:** Captures latency, token counts, and "Thought Blocks" for every step.



## 3. Cost & Token Management (FinOps)
Given your experience reducing infra costs by 80% at GlobalVision, this sub-module prevents "recursive loop bankruptcy."
- **Budget Circuit Breakers:** If an agent task exceeds a pre-defined token threshold (e.g., $0.50), the system pauses and triggers a **Human-in-the-Loop (HITL)** alert.
- **Model Attribution:** Tracks which model (Claude vs. GPT-4o) is driving the most cost vs. providing the highest success rate.

## 4. Evaluation (Agent Unit Testing)
We move beyond string-matching tests. We use **"LLM-as-a-Judge"** and **Deterministic Evals**.

| Eval Type | Logic | Purpose |
| :--- | :--- | :--- |
| **Tool Call Accuracy** | Does the agent pass the *correct* params to the `@djm204/agent-skills` package? | Prevent "Ghost Param" hallucinations. |
| **Architectural Adherence**| Does the output follow the **ADR** rules stored in **MOD-03**? | Ensure TS/React standards are met. |
| **Regression Testing** | Rerunning a successful "Golden Trace" from the past against a new model version. | Ensure "GPT-5" doesn't lose skills GPT-4 had. |

## 5. Implementation Strategy: Open-Source First
To keep the system modular and AI-agnostic, MOD-05 is designed to export data in **OpenTelemetry (OTEL)** format. This allows you to plug into:
- **Langfuse / Phoenix:** For deep agent-trace visualization.
- **Prometheus / Grafana:** For high-level system health and cost dashboards.
- **Local SQLite:** For a lightweight, zero-dependency dev environment.

## 6. Incident Response for Agents
When an agent "goes rogue" or enters an infinite loop:
1. **Detection:** MOD-05 identifies a "Repeating Trace Pattern."
2. **Action:** It triggers an interrupt signal to **MOD-04 (The Planner)** to stop execution.
3. **Report:** It generates a "Post-Mortem" markdown file explaining the logic failure.