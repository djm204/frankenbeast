---
title: First pull request CI failure triage
description: A safe, repeatable workflow for first-time Frankenbeast contributors to diagnose and fix failing pull-request checks.
---

# First pull request CI failure triage

Use this guide when a check on your first Frankenbeast pull request is red or cancelled. The goal is to identify one failing check, reproduce the smallest relevant command locally, and push one focused correction. Do not rerun jobs repeatedly before understanding the failure.

## 1. Confirm the failing head

Set your pull-request number and inspect the current head and check summary:

```bash
PR_NUMBER="123" # replace with your pull-request number
REPO="djm204/frankenbeast"

gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json headRefName,headRefOid,mergeStateStatus,url

gh pr checks "$PR_NUMBER" --repo "$REPO"
```

Compare `headRefOid` with your local commit before changing files:

```bash
git status --short --branch
git rev-parse HEAD
```

If the SHAs differ, fetch and inspect the pull-request branch before diagnosing. Do not overwrite a collaborator's newer commit or force-push unfamiliar history.

## 2. Read the failed job, not only the red badge

Open the failed check from the pull request, or find the workflow run for the PR branch:

```bash
BRANCH="$(gh pr view "$PR_NUMBER" --repo "$REPO" --json headRefName --jq .headRefName)"
gh run list --repo "$REPO" --branch "$BRANCH" --limit 10
```

Then inspect the failed steps from the matching run:

```bash
RUN_ID="123456789" # replace with the matching workflow run id
gh run view "$RUN_ID" --repo "$REPO" --log-failed
```

Start with the first meaningful error in the failed step, then read the final summary. Later errors are often consequences of the first failure.

Before posting logs publicly, remove provider keys, tokens, webhook URLs, `.env` values, private paths, and user data. Share a short relevant excerpt, not the complete job log.

## 3. Classify the failure

| Signal                                                                      | Next action                                                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A test names a file or assertion changed by your PR                         | Run that test locally, fix the issue-scoped regression, and rerun it.                                                                            |
| Typecheck, lint, or build fails in a touched package                        | Run the matching package command, fix only errors caused by the PR, then rerun the package gate.                                                 |
| A root documentation or Markdown-link test fails                            | Fix the broken repository-relative link or focused docs assertion, then run `npm run test:root`.                                                 |
| The run was cancelled or a service/network step failed without a code error | Check GitHub Actions status and recent runs before requesting one rerun. Do not change product code to hide an infrastructure failure.           |
| The failure also occurs on current `main` and is unrelated to your diff     | Capture the command, current head SHA, and redacted error in the PR. Ask whether to wait or track it separately; do not bundle an unrelated fix. |
| The log is unclear or contains a possible secret/security issue             | Stop and use the [first-contribution help guide](getting-help.md) or private process in [SECURITY.md](../../SECURITY.md).                        |

Use the [test command decision tree](test-command-decision-tree.md) to choose the narrowest relevant local command. Examples:

```bash
# Focused root regression
npm run test:root -- tests/docs-issue-1234.test.ts

# Complete root tests, including local Markdown links
npm run test:root

# Package gates (replace the workspace name)
npm test --workspace @franken/example
npm run typecheck --workspace @franken/example
npm run build --workspace @franken/example
```

Never claim a command passed if it was skipped or still failed.

## 4. Fix and verify one cause at a time

After the focused command passes, inspect the exact diff and staged files:

```bash
git status --short
git diff --check
git diff --stat
git add -p
git diff --cached --stat
git diff --cached
```

Commit only the CI-related correction with a Conventional Commit subject, push it to the existing PR branch, and wait for checks on the new head:

```bash
git commit -m "fix(scope): address CI failure"
git push
gh pr checks "$PR_NUMBER" --repo "$REPO" --watch
```

Every push creates a new head. A green run or approval from an older SHA does not prove the current head is ready.

## 5. Request one rerun only when appropriate

Use the GitHub UI's **Re-run failed jobs** action only after confirming the failure is transient and the current head has not changed. If you have permission to use the CLI, select the exact failed run and rerun failed jobs once:

```bash
gh run rerun "$RUN_ID" --repo "$REPO" --failed
```

Do not repeatedly rerun deterministic test, lint, typecheck, or build failures. Reproduce and fix those locally instead.

## Escalation template

If the failure remains unclear, post this in the pull request:

```text
Blocked check: <check name>
Current head: <headRefOid>
Local reproduction: <exact command and result>
First relevant error: <short redacted excerpt>
What I changed or ruled out: <one or two bullets>
Decision needed: <one focused question>
```

After checks pass on the current head, return to the [contributor guide](../../CONTRIBUTING.md) for review feedback and merge readiness.
