# Lessons

- Create `tasks/<name-of-task>-progress.md` only for larger implementation, debugging, recovery, migration, or design tasks with multiple steps and meaningful interruption risk. Do not create progress docs for administrative tasks like committing, pushing, opening PRs, or quick one-shot work.
- If user asks for `caveman` or very brief comms, switch style immediately and keep all later commentary/final response in caveman mode until user says stop.
- For integration initiatives, assume existing engines should be wrapped, not rewritten. State explicitly when work is MCP transport/adapters versus core engine implementation.
- If the user mentions a recent merge or suspects scope drift, verify exact branch ancestry against `main` and `origin/main` before continuing. Report the concrete branch name and commit SHAs instead of assuming the worktree is current.
- When executing a multi-chunk implementation, commit each finished chunk atomically as soon as its targeted tests and typechecks are green. Do not let multiple completed chunks pile up uncommitted.
- Before any commit, inspect the staged index itself (`git diff --cached --stat` or equivalent), not just `git status`, because unrelated files may already be staged from earlier work.
- If the user explicitly says a migration is a breaking change with no backward compatibility, do not preserve legacy paths or fallback behavior. Move the canonical runtime to the new contract directly.
- When a user says a folder migration should be "across the board," do not stop at one package. Sweep all live runtime code first, then update active contract docs, and leave only stale historical docs untouched.
- When a user corrects the suspected subsystem during debugging, treat that as a concrete signal update and re-check the live failure path before continuing with prior assumptions.
- For Codex hook protocol work, verify the success path as well as the deny path. `PreToolUse` allow responses must match Codex’s real protocol, not just "look symmetric" with deny responses, and generated repo-local hook scripts may still need regeneration even when MCP server code is updated.
