# LLM-Powered Squash Commits & PR Descriptions

**Date**: 2026-03-06
**Status**: Approved
**Approach**: C — Post-hoc generation in PrCreator + squash merge in GitBranchIsolator

## Problem

The build runner produces meaningless commit messages (`auto: impl 03_base_branch_detection iter 1`) and generic PR descriptions (`feat: frankenbeast (11 chunks)`). These provide no context about what was actually built.

## Design

### Changes

**1. `GitBranchIsolator.merge()` — squash merge with optional message**

Current: `git merge branch --no-edit` preserves all `auto:` iteration commits.

New: `merge(chunkId, commitMessage?)` uses `git merge --squash branch` + `git commit -m <message>`. This collapses each chunk's iterations into one clean commit on the base branch. When no message is provided, falls back to current behavior for backward compatibility.

**2. `PrCreator` — optional `ILlmClient` for message generation**

Constructor gains optional `ILlmClient` (`complete(prompt: string): Promise<string>` from `@franken/types`).

New methods:
- `generateCommitMessage(diffStat, chunkObjective): Promise<string>` — conventional commit from diff context
- `generatePrDescription(commits, diffStat, result): Promise<{ title: string; body: string }>` — PR title + markdown body

When `ILlmClient` is absent or call fails, falls back to current static templates.

**3. Execution phase wiring**

The execution phase calls `GitBranchIsolator.merge()` per chunk. Before merging, it calls `PrCreator.generateCommitMessage()` with `git diff --stat base..branch` + chunk objective, then passes the message to `merge()`.

At PR creation time, `PrCreator.create()` calls `generatePrDescription()` with `git log base..HEAD --oneline` + `git diff --stat base..HEAD`.

### LLM Prompts

**Commit message:**
```
Write a semver-compatible conventional commit message for this change.
Format: type(scope): description
Types: feat, fix, chore, refactor, docs, test, ci, perf
One line, max 72 chars. No markdown, no backticks.
The type determines semver bump: feat = minor, fix = patch, BREAKING CHANGE footer = major.

Chunk objective: {objective}
Files changed:
{diffStat}
```

**PR description:**
```
Write a GitHub PR title and body for these changes.
Title: max 70 chars, semver-compatible conventional commit style (e.g. feat(module): description).
Body: markdown with ## Summary (2-4 bullets) and ## Changes (key files).

Commits:
{commitLog}

Files changed:
{diffStat}

Project: {projectId}
Chunks completed: {count}

Respond in this exact format:
TITLE: <title here>
BODY:
<body here>
```

### Fallback Strategy

If LLM call fails (rate limit, timeout, no client injected):
- Commit message falls back to `feat({scope}): implement {chunkId}` (semver-compatible)
- PR title/body fall back to current static `buildTitle()`/`buildBody()`
- Never blocks the pipeline on message generation

### Files Modified

| File | Change |
|------|--------|
| `franken-orchestrator/src/skills/git-branch-isolator.ts` | Add optional `commitMessage` param to `merge()`, use `--squash` when provided |
| `franken-orchestrator/src/closure/pr-creator.ts` | Add optional `ILlmClient`, `generateCommitMessage()`, `generatePrDescription()` |
| `franken-orchestrator/src/phases/execution.ts` | Wire commit message generation before merge |
| `franken-orchestrator/src/deps.ts` | No change — `ILlmClient` comes from `@franken/types`, passed directly to PrCreator |
| `franken-orchestrator/tests/unit/skills/git-branch-isolator.test.ts` | Add squash merge tests |
| `franken-orchestrator/tests/unit/pr-creator.test.ts` | Add LLM generation tests with mock ILlmClient |

### Backward Compatibility

- `GitBranchIsolator.merge(chunkId)` without message works exactly as before
- `PrCreator` without `ILlmClient` works exactly as before
- Build runners that don't inject an LLM client see no change
