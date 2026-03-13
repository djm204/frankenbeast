🏗️ Frankenbeast: Orchestrator Functional Overview1. Executive SummaryThe Orchestrator is a Stateful Supervisor. It is responsible for the transition between the 8 modules, ensuring that no action is taken without proper guarding, planning, and critique. It maintains the "Shared Mental Model" of the system through a unified context object.2. The Orchestrator Lifecycle (The "Beast" Loop)The Orchestrator manages the execution flow through four distinct phases. It is non-linear; it can loop back to earlier phases if a module (like the Critique module) signals a failure.Phase 1: Ingestion & HydrationAction: Intercepts raw user input.Modules: MOD-01 (Guardrails) & MOD-03 (Memory).Logic: Scrub the input for PII, then inject relevant ADRs and previous episodic traces to give the agent "contextual wisdom."Phase 2: Recursive PlanningAction: Generate and verify the technical roadmap.Modules: MOD-04 (Planner) & MOD-06 (Self-Critique).Logic: The Planner generates a Task DAG. The Reviewer (Critique) audits it. If the Reviewer finds a flaw (e.g., "This violates our TypeScript ADR"), the Orchestrator forces a re-plan.Phase 3: Validated ExecutionAction: Execute the approved steps.Modules: MOD-02 (Skills) & MOD-07 (HITL).Logic: The Orchestrator pulls tool logic from @djm204/agent-skills. If a task is marked as "High Stakes," it pauses and triggers the Human-in-the-Loop gateway.Phase 4: Observability & ClosureAction: Record the results and finalize.Modules: MOD-05 (Obs) & MOD-08 (Heartbeat).Logic: Logs the full trace, updates the token spend, and triggers a "Pulse" to see if any proactive improvements are needed based on the outcome.3. Shared State: The FrankenContextThe Orchestrator maintains a singleton state object that is passed to every module. This ensures "Brutal Honesty" because every module sees the same data.Data CategoryPurposeGlobal StateCurrent project ID, security level, and total token budget.The PlanThe active Directed Acyclic Graph (DAG) of tasks and current progress.The SkillsetVerified tool definitions synced from @djm204/agent-skills.The MemoryRecent failures, successes, and relevant architectural rules.The AuditA list of all critique feedback and human approvals for the current session.4. Key Orchestration Logic (Pseudocode)TypeScript// The heart of 'npm run start:beast'
async function orchestrate(userInput: string) {
  // 1. Initialize State
  const context = await initializeContext(userInput);

  // 2. Planning Loop
  while (context.planStatus !== 'APPROVED') {
    context.plan = await MOD04.plan(context);
    context.lastCritique = await MOD06.review(context.plan);
    if (context.lastCritique.isPassed) context.planStatus = 'APPROVED';
  }

  // 3. Execution Loop
  for (const task of context.plan.tasks) {
    if (task.requiresApproval) await MOD07.waitForHuman(task);
    
    const result = await MOD02.execute(task); // Pulls from @djm204/agent-skills
    await MOD03.record(task, result);         // Stores in Episodic Memory
    await MOD05.trace(task, result);          // Logs to Observability
  }

  // 4. Final Pulse
  await MOD08.triggerPulse(context);
}
5. Failure Handling (The Circuit Breaker)The Orchestrator is programmed with a "Fail-Fast" mentality:Security Breach: If MOD-01 detects an injection, the Orchestrator kills the process immediately.Budget Overrun: If MOD-05 reports token spend exceeding the limit, the loop breaks and triggers MOD-07.Recursive Spiral: If the MOD-06 critique fails 3 times on the same plan, it escalates to the human.