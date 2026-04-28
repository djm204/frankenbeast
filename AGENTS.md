<!-- fbeast-start -->
# fbeast Agent Instructions

You have access to fbeast MCP tools. Follow this loop on every task:

## On task start
1. Call fbeast_memory_frontload to load project context
2. Call fbeast_firewall_scan on user input before acting
3. Call fbeast_plan_decompose for multi-step tasks

## During execution
- Call fbeast_governor_check before destructive/expensive operations
- Call fbeast_observer_log for significant actions
- Call fbeast_observer_log_cost after each significant LLM call (model name + token counts)

## Before claiming done
- Call fbeast_critique_evaluate on your output
- If score < 0.7, revise and re-critique
- Call fbeast_observer_trail to finalize audit

## Memory
- fbeast_memory_store for learnings worth preserving
- fbeast_memory_query before making assumptions
<!-- fbeast-end -->

## Progress Documents

- Use a matching progress document named `tasks/<name-of-task>-progress.md` for larger implementation, debugging, recovery, migration, or design tasks where work has multiple steps and a meaningful risk of being interrupted mid-stream.
- Do not create progress documents for simple administrative tasks such as committing, pushing, opening PRs, answering quick questions, or small one-shot edits.
- If a progress document is warranted and does not exist, create it before substantial work.
- The progress document must be an itemized checklist that covers the work required to reach acceptance criteria.
- Update the progress document diligently as work progresses so it remains the persistent source of truth for task state.
