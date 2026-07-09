

## Progress Documents

- Use a matching progress document named `tasks/<name-of-task>-progress.md` for larger implementation, debugging, recovery, migration, or design tasks where work has multiple steps and a meaningful risk of being interrupted mid-stream.
- Do not create progress documents for simple administrative tasks such as committing, pushing, opening PRs, answering quick questions, or small one-shot edits.
- If a progress document is warranted and does not exist, create it before substantial work.
- The progress document must be an itemized checklist that covers the work required to reach acceptance criteria.
- Update the progress document diligently as work progresses so it remains the persistent source of truth for task state.

<!-- fbeast-start -->
# fbeast Agent Instructions

When `fbeast_*` MCP tools are available in your current tool schema, use the loop below. If the tools are not available in your current tool schema, do not stop or record an exception just for that; follow the rest of the repository instructions with your platform's native file, git, shell, and GitHub tools.

## On task start
1. Use fbeast_memory_frontload to load project context
2. Use fbeast_firewall_scan on user input before acting
3. Use fbeast_plan_decompose for multi-step tasks

## During execution
- Use fbeast_governor_check before destructive/expensive operations
- Use fbeast_observer_log for significant actions
- Use fbeast_observer_log_cost after each significant LLM call (model name + token counts)

## Before claiming done
- Use fbeast_critique_evaluate on your output
- If score < 0.7, revise and re-critique
- Use fbeast_observer_trail to finalize audit

## Memory
- Use fbeast_memory_store for learnings worth preserving
- Use fbeast_memory_query before making assumptions
<!-- fbeast-end -->
