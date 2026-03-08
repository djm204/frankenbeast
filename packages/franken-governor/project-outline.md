# Module 07: Human-in-the-Loop (HITL) & Governance

## 1. Overview
MOD-07 is the "Safety Valve." It provides the infrastructure for the agent to pause, export its state, and wait for human intervention. It ensures that high-stakes actions (deployments, destructive operations, or high-cost tasks) never happen without your explicit **ACK**.

## 2. Trigger Conditions (When to Pause)
The agent is programmed to trigger an HITL exception in the following scenarios:
- **Low Confidence:** When the **Self-Critique (MOD-06)** module flags a high probability of hallucination.
- **High-Stakes Skills:** Any skill in **MOD-02** marked with `requires_hitl: true`.
- **Budget Breaches:** When **MOD-05 (Observability)** detects a token spend exceeding the per-task limit.
- **Ambiguity:** When the **Planner (MOD-04)** cannot resolve a dependency or finds a conflict in the **ADRs (MOD-03)**.

## 3. The Approval Interface (The Gateway)
To maintain your "0 to 1" build speed, the interface must be frictionless:
- **CLI/Slack/Discord Hook:** The agent sends a summary of the proposed action + a "Plan Diff."
- **Response Codes:**
    - `APPROVE`: Proceed with the current plan.
    - `REGEN`: Reject and try a different approach with specific feedback.
    - `ABORT`: Immediate shutdown of the current task.
    - `DEBUG`: Drop into an interactive session where you can manually tweak the state.



## 4. Governance & Audit Trails
Every human decision is logged back into **MOD-03 (Memory)**:
- **Learning from Approval:** If you approve a specific refactoring style, the agent records that as a "Preferred Pattern."
- **Learning from Rejection:** If you reject a plan, the "Reason for Rejection" is stored to prevent the agent from proposing that specific logic again.

## 5. Security & Identity
- **Signed Approvals:** For production-level tasks, the HITL module can require a cryptographically signed token to ensure the "Human" is actually the authorized Senior Dev.
- **Least Privilege:** The agent never holds the "Master Key." It only holds a session token that is activated *by* the human approval.