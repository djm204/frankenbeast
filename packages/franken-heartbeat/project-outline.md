# Module 08: The Heartbeat Loop (Proactive Reflection)

## 1. Overview
Inspired by OpenClaw, the Heartbeat Loop is a scheduled autonomous trigger. It forces the Frankenbeast to "wake up" independently of user prompts to perform self-reflection, maintenance, and proactive planning.

## 2. The Heartbeat Lifecycle
The loop follows a "Cheap Check -> Expensive Reasoning" escalation to manage costs (MOD-05).

1. **The Pulse (Pulse Trigger):** A cron job (e.g., every 30 mins or 2 AM daily).
2. **Deterministic Check (The "Cheap" Phase):**
    - Scans `HEARTBEAT.md` for pending tasks.
    - Checks CI/CD status or git repo "dirtiness."
    - If nothing is flagged, returns `HEARTBEAT_OK` and sleeps (Zero token cost).
3. **Self-Reflection (The "Expensive" Phase):**
    - If a flag is found or the 2 AM "Deep Review" triggers:
    - Queries **MOD-05 (Observability)** for the last 24h of traces.
    - Queries **MOD-03 (Memory)** for successes and failures.
4. **Action/Reporting:**
    - Proposes improvements to its own **Skills Registry (MOD-02)**.
    - Sends a "Morning Brief" to the user via the **HITL Gateway (MOD-07)**.

## 3. The 2 AM "Deep Reflection" Questions
During the nightly heartbeat, the agent must answer:
- **What patterns emerged?** (e.g., "I failed 4 times to refactor the Multi-Currency UI because of a missing mock.")
- **What should improve?** (e.g., "I need a new skill in `@djm204/agent-skills` for handling specific Staples API errors.")
- **Technical Debt:** "Are there legacy refactors I can perform now while the user is offline?"

## 4. Integration Points
- **MOD-03 (Memory):** Heartbeats summarize "Episodic" traces into "Semantic" lessons.
- **MOD-04 (Planner):** The Heartbeat can inject new "Self-Improvement" tasks into the Planner's queue.
- **MOD-06 (Self-Critique):** The Reviewer agent audits the Heartbeat's conclusions to ensure the "improvements" aren't hallucinations.

## 5. Sample `HEARTBEAT.md` (The Checklist)
```markdown
## Active Watchlist
- [ ] Monitor CI for 'Staples-UI' branch.
- [ ] Daily 2AM: Refactor any 'TODO' comments in `/src/services`.
- [ ] Alert if token spend > $5.00 today.

## Reflection Log
- *Yesterday:* Refactored 3 components. 100% test pass.
- *Issue:* Slow response on Jira skill.
- *Improvement:* Cache Jira metadata in MOD-03.