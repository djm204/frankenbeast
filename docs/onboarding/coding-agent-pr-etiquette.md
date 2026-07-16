# Coding-agent PR etiquette guide

Use this guide when an autonomous or semi-autonomous coding agent opens, updates, reviews, or merges a Frankenbeast pull request. The goal is to make each PR independently reviewable, easy to close out, and safe for PM/liveness tooling to reason about.

## Fast checklist

Before opening or updating a PR:

1. Confirm the issue scope in GitHub and work only that issue unless a PM explicitly changes the assignment.
2. Use one issue, one branch, and one PR. Put the issue number in the branch name and the PR body.
3. Read `tasks/resolve-issues-shared-lessons.md` and `tasks/lessons.md` when they exist before making changes.
4. Keep commits atomic and Conventional Commit formatted, for example `docs(onboarding): add coding-agent PR etiquette guide`.
5. Run the narrowest deterministic checks that cover the change, then a broader package/root gate when it is practical.
6. Open the PR with `Closes #<issue-number>`, a concise summary, and exact verification evidence.
7. If the workflow requires Codex, trigger the real GitHub `@codex review` bot and wait for a current-head clean result before merge.

## Required PR body fields

Every coding-agent PR should include enough structured context for a reviewer or another worker to take over without chat history:

```text
## Summary
- <user-visible or operator-visible change>
- <tests/docs/runtime surfaces touched>

## Verification
- <exact command> — <result>
- <exact command> — <result>

## Scope and handoff
- Issue: Closes #<number>
- Branch: <branch-name>
- Ownership entries: <docs/onboarding/repository-ownership.manifest.json ids, when relevant>
- Codex: current-head clean | not required | blocked: <reason>
```

If a command was intentionally skipped, say why and name the smaller command that was run instead. Do not write generic claims such as "tests passed" without the command and result.

## Review and update etiquette

- Keep PR titles and commit subjects in Conventional Commit form: `type(scope): summary`.
- Prefer small follow-up commits while a PR is under review; squash merge can clean the final history.
- When responding to review comments, explain the concrete fix, push it, and resolve only the thread that the fix actually addresses.
- After changing the head commit, treat older CI and Codex results as stale until the current head has its own green checks and clean review signal.
- If a PR was merged while a review was still in flight and the bot later reports a real current-head issue, open a narrow follow-up PR instead of hiding the finding in the old thread.

## Negative and edge cases

These cases must be explicit in PR handoffs so agents do not create duplicate or unsafe work:

- Do not combine unrelated issues in one PR, even when nearby files overlap.
- Do not open a second PR for the same issue until you have checked live open PRs and confirmed the existing PR is closed, superseded, or owned by your current task.
- Do not merge on Codex silence, usage-limit text, an `eyes` reaction, resolved old threads, or an all-clear from an older head.
- Do not use vague verification lines such as "lint/tested manually" when a deterministic command or manual scenario can be named.
- Do not broaden a documentation-only onboarding issue into runtime behavior unless the issue explicitly requires runtime changes.
- Do not delete or overwrite another worker's dirty worktree while closing out your own PR.

## PM and worker handoff notes

When a PR cannot be merged immediately, leave a handoff that names the exact blocker and the next safe command. A useful handoff looks like this:

```text
Current head: <sha>
CI: green | failing <check-name> | pending
Codex: clean | findings unresolved | usage-limited | not triggered
Blocked command, if any: <exact command>
Next safe command: <command that continues the same PR, not a duplicate branch>
Verification already run: <commands and results>
```

For ownership routing, read the repository ownership manifest and include matching entry ids when a PR spans packages, docs, scripts, or workflows. For docs-only onboarding changes, `onboarding-docs` is the expected ownership surface.

## Maintainer review cues

Reviewers should be able to answer these questions from the PR without reading the agent transcript:

- What issue is closed, and what issue is intentionally not touched?
- What files changed, and which ownership entries do they map to?
- What deterministic evidence proves the intended behavior or documentation exists?
- What negative case prevents future agents from misusing the new guidance?
- Is the Codex/CI state current for the latest head commit?
