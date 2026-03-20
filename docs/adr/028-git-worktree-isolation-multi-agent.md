# ADR-028: Git Worktree Isolation for Multi-Agent Concurrency

- **Date:** 2026-03-16
- **Status:** Accepted
- **Deciders:** pfk

## Context

When multiple agents run concurrently, they share the same git working directory. This causes:

- Conflicting file modifications between agents
- Race conditions on git operations (commit, branch, merge)
- Inability to create per-agent feature branches without switching the shared checkout
- No isolation between agent workspaces — a crash in one can leave dirty state affecting others

The system needs a way to give each agent its own isolated copy of the repository without the overhead of full clones.

## Decision

Use **git worktrees** to create an isolated working directory per agent.

**Implementation:**

1. When `ProcessBeastExecutor.start()` spawns an agent, it first creates a worktree:
   ```
   git worktree add .frankenbeast/.worktrees/<agent-id> -b beast/<agent-id>
   ```
2. The worktree path becomes the `cwd` in the `BeastProcessSpec` — the agent operates entirely within its own copy
3. Each agent gets its own branch (`beast/<agent-id>`) for commits and PR creation

**Lifecycle:**

| Agent State | Worktree Action |
|-------------|----------------|
| Created | Worktree created, branch created |
| Running | Agent works in worktree directory |
| Completed (exit 0) | Worktree preserved — branch available for PR/merge |
| Failed | Worktree preserved for debugging |
| Deleted | `git worktree remove` + `git branch -D` cleanup |

**Port conflicts:**

The `--verbose` trace viewer gets a dynamic port (`:0`, OS-assigned) instead of the hardcoded `:4040`. The actual port is written to the log stream.

## Consequences

### Positive
- Complete filesystem isolation between concurrent agents
- Each agent can commit, branch, and create PRs independently
- Failed agents leave their worktree intact for debugging
- No git operation races — each agent has its own index and HEAD
- Leverages native git feature — no custom filesystem abstraction

### Negative
- Disk space: each worktree is a lightweight checkout but still uses space for modified files
- Worktree cleanup must be reliable — orphaned worktrees waste disk space
- Some tools may not handle worktree paths correctly (rare, but possible)

### Risks
- If the base branch moves while agents are running, their worktrees may need rebasing before merge
- Large repositories with many modified files could use significant disk space with many concurrent agents (mitigated by concurrency limit, default 5)

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Full git clone per agent | Maximum isolation | Slow, heavy disk/network usage | Overkill; worktrees provide sufficient isolation |
| Shared directory with file locking | No extra disk | Complex, fragile, deadlock risk | Doesn't solve branch/commit isolation |
| Container-based isolation | Hard isolation + resource limits | Docker dependency, image management | Future enhancement; worktrees solve the immediate problem |
| No isolation, sequential execution only | Simple | No concurrency | Defeats the purpose of multi-agent support |
