# Lessons

- If the user explicitly asks to isolate work from a dirty tree, stop using the current checkout and create a fresh worktree from `main` before implementation continues.
- When a git identity matters for local commits or test harness repos, use the user's actual git identity instead of a synthetic placeholder.
- When asked whether work is mid-flight or the tree is clean, `git status` on the current checkout is NOT sufficient — always run `git worktree list` and check each worktree's status. Why: in-flight work commonly lives in a sibling worktree, and reporting "clean" from one checkout hides it. How to apply: enumerate worktrees and report per-worktree dirty/ahead state before concluding.
- Run `npm test`/`turbo` from the correct directory: package scripts (e.g. `test`, `lint`) from the package dir, `turbo`-backed root scripts from the worktree root. Why: the Bash tool's cwd persists across calls, so an earlier `cd` can silently misroute later commands (root `npm test` → `turbo … --run` arg error; `npx turbo` from a package → "Missing script turbo"). How to apply: prefix dir-sensitive commands with an explicit `cd <abs path> &&`.
