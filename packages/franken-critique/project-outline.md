# Module 06: Self-Critique & Reflection (The Reviewer)

## 1. Overview
MOD-06 implements the reviewer side of the "Reflexion" pattern. It evaluates plans or generated content before they reach the user or production environment. Its goal is to identify safety issues, hallucinations, logic flaws, complexity bloat, and architectural drift.

Current status: this outline preserves the original MOD-era framing as historical design context. Current critique execution is implemented through `@franken/critique`, with orchestration and MCP exposure handled by `@franken/orchestrator` and `@franken/mcp-suite`. Treat the root `README.md` and root `package.json` workspaces as authoritative.

## 2. The Critique Loop
The wider system can operate in a "Generator-Reviewer" cycle:
1. **Initial Draft:** The Actor agent proposes code or a plan.
2. **Severed Critique:** The Reviewer agent (MOD-06) analyzes the draft against the **Guardrails (MOD-01)** and **Semantic Memory (MOD-03)**.
3. **Feedback Injection:** If flaws are found, MOD-06 returns a `CorrectionRequest` with specific, actionable feedback.
4. **Refinement:** The caller/orchestrator decides whether to ask the Actor to regenerate and can feed the revised input back into MOD-06.

Current implementation note: `CritiqueLoop` does not call the Actor itself. It composes `CritiquePipeline` and circuit breakers, runs `run(input, config)`, and returns pass/fail/halt information plus a correction request only when appropriate for the caller to handle.

## 3. Core Components

### 3.1 The "Naysayer" Persona
The Reviewer is prompted as a "Senior Technical Architect" with a bias toward skepticism. It specifically looks for:
- **Ghost Dependencies:** Package imports or tool claims not present in the current workspace/package manifest or orchestrator/MCP tool registry.
- **Complexity Bloat:** Code that violates your preference for 0-to-1 build simplicity.
- **Logic Loops:** Infinite recursions or improper error handling.
- **ADR Non-Compliance:** Code that ignores the architecture rules stored in memory.

### 3.2 Automated Verification Scope
Current MOD-06 evaluators are in-process critique checks: safety, ghost dependency, logic loop, factuality, conciseness, complexity, scalability, and ADR compliance. It does not currently run lint/type/unit-test commands or dry-run code in a sandbox. Consumers that need those checks should run them separately and pass the results into critique context.



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
