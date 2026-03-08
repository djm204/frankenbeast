# Module 06: Self-Critique & Reflection (The Reviewer)

## 1. Overview
MOD-06 implements the "Reflexion" pattern. It is a secondary, specialized agentic process that evaluates the output of the "Coder/Actor" agent before it reaches the user or the production environment. Its goal is to identify hallucinations, logic flaws, and architectural drift.

## 2. The Critique Loop
The module operates in a "Generator-Reviewer" cycle:
1. **Initial Draft:** The Actor agent proposes code or a plan.
2. **Severed Critique:** The Reviewer agent (MOD-06) analyzes the draft against the **Guardrails (MOD-01)** and **Semantic Memory (MOD-03)**.
3. **Feedback Injection:** If flaws are found, MOD-06 returns a "Correction Request" with specific, actionable feedback.
4. **Refinement:** The Actor regenerates based on the critique. This repeats until a "Pass" is achieved or a max-loop limit is hit.

## 3. Core Components

### 3.1 The "Naysayer" Persona
The Reviewer is prompted as a "Senior Technical Architect" with a bias toward skepticism. It specifically looks for:
- **Ghost Dependencies:** Package imports not present in the `@djm204/agent-skills` registry.
- **Complexity Bloat:** Code that violates your preference for 0-to-1 build simplicity.
- **Logic Loops:** Infinite recursions or improper error handling.
- **ADR Non-Compliance:** Code that ignores the architecture rules stored in memory.

### 3.2 Automated Verification Tools
MOD-06 leverages the **Skill Registry (MOD-02)** to run deterministic checks:
- **Linting/Types:** Does the code pass a static type check?
- **Unit Test Runner:** Does the proposed code pass existing tests?
- **Dry-Run Executor:** Executes code in a **MOD-01 Sandbox** to verify the output matches expectations.



## 4. Evaluation Criteria (The "Honesty" Checklist)

| Metric | Reviewer Action |
| :--- | :--- |
| **Factuality** | Cross-reference claims against documentation in MOD-03. |
| **Safety** | Ensure no unauthorized API calls or data leaks (MOD-01 alignment). |
| **Conciseness** | Flag "fluff" or over-engineered solutions. |
| **Scalability** | Evaluate if the 0-to-1 build can handle enterprise scaling later. |

## 5. Stopping Conditions (Circuit Breakers)
To prevent infinite "argument" loops between agents:
- **Max Iterations:** Hard cap of 3-5 reflection cycles.
- **Consensus Failure:** If the agents cannot agree after $N$ cycles, the system triggers a **Human-in-the-Loop (HITL)** request for manual arbitration.
- **Token Budget:** MOD-05 (Observability) can kill the loop if the "cost of thinking" exceeds the budget.

## 6. Self-Correction Memory
Successful critiques are fed back into **MOD-03 Episodic Memory**. 
- *Example:* If the Reviewer catches a recurring bug in how the Actor uses `Next.js` Server Components, that "lesson" is stored so the Actor avoids that specific mistake in the future.