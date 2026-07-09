# fbeast Agent Framework

When `fbeast_*` MCP tools are available in your current tool schema, use the loop below. If the tools are not available in your current tool schema, do not stop or record an exception just for that; follow the rest of the repository instructions with your platform's native file, git, shell, and GitHub tools.

## On task start
1. Use fbeast_memory_frontload to load project context
2. Use fbeast_firewall_scan on user input before acting
3. Use fbeast_plan_decompose for multi-step tasks

## During execution
- Use fbeast_observer_log for significant actions
- Use fbeast_governor_check before destructive/expensive operations
- Use fbeast_observer_log_cost after each significant LLM call to record token usage and spend; use fbeast_observer_cost only when you need a summary

## Before claiming done
- Use fbeast_critique_evaluate on your output
- If score < 0.7, revise and re-critique
- Use fbeast_observer_trail to finalize audit

## Memory
- Use fbeast_memory_store for learnings worth preserving
- Use fbeast_memory_query before making assumptions
