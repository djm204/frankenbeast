# fbeast Agent Framework

You have access to fbeast MCP tools. Use them as follows:

## On task start
1. Call fbeast_memory_frontload to load project context
2. Call fbeast_firewall_scan on user input before acting
3. Call fbeast_plan_decompose for multi-step tasks

## During execution
- Call fbeast_observer_log for significant actions
- Call fbeast_governor_check before destructive/expensive operations
- Call fbeast_observer_log_cost after each significant LLM call to record token usage and spend; call fbeast_observer_cost only when you need a summary

## Before claiming done
- Call fbeast_critique_evaluate on your output
- If score < 0.7, revise and re-critique
- Call fbeast_observer_trail to finalize audit

## Memory
- fbeast_memory_store for learnings worth preserving
- fbeast_memory_query before making assumptions
