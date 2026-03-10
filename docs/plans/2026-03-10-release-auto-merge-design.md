# Release Auto-Merge Design

**Date:** 2026-03-10

## Goal

Make root-level Release Please PRs automatically approve and merge, but only after CI is successful.

## Context

The repository already has a root [`.github/workflows/release-please.yml`](/home/pfk/dev/frankenbeast/.worktrees/beasts-dispatch-station/.github/workflows/release-please.yml) workflow that opens and updates release PRs. It does not currently enable automerge, so release PRs stall after being labeled. Some sibling packages already ship lightweight auto-merge workflows gated on the `autorelease: pending` label, but those flows enable automerge immediately rather than waiting for CI.

The repo also has a single root CI workflow at [`.github/workflows/ci.yml`](/home/pfk/dev/frankenbeast/.worktrees/beasts-dispatch-station/.github/workflows/ci.yml). That is the authoritative workflow to gate release PR merges for the monorepo.

## Options Considered

### 1. Copy the existing label-only package workflow to the root

This would be the fastest implementation, but it would enable automerge before CI is green. That conflicts with the stated requirement and weakens branch-protection semantics.

### 2. Recommended: dedicated root release auto-merge workflow gated on successful CI

Add a new root workflow that reacts to Release Please PR activity and CI completion. It should only auto-approve and enable automerge when all release guards pass, especially a successful CI conclusion. This preserves the normal GitHub merge path and keeps branch protection authoritative.

### 3. Merge release PRs directly from Actions after CI succeeds

This can work, but it is more brittle. It bypasses the normal “enable automerge and let GitHub merge once protections are satisfied” flow and is more likely to conflict with branch protection or future required checks.

## Decision

Use option 2.

## Workflow Design

Add a new workflow at [`.github/workflows/release-auto-merge.yml`](/home/pfk/dev/frankenbeast/.worktrees/beasts-dispatch-station/.github/workflows/release-auto-merge.yml).

### Triggers

- `pull_request_target` on:
  - `opened`
  - `reopened`
  - `synchronize`
  - `labeled`
- `workflow_run` on completion of the root `CI` workflow

The PR trigger handles newly created or updated release PRs. The workflow-run trigger handles the later point where CI turns green, which is the main missing behavior today.

### Guards

The workflow should act only when all of the following are true:

- PR is open
- PR base branch is `main`
- PR is not draft
- PR has the `autorelease: pending` label
- PR appears to be a Release Please PR
  - practical gate: label plus head branch naming pattern like `release-please--...`
- the CI workflow finished with `success`
- the PR head SHA has no failing or pending required checks remaining

If any guard fails, the workflow should exit successfully without changing the PR.

### Auth Model

Reuse the existing GitHub App pattern already present in package-level auto-merge workflows:

- `APP_ID`
- `APP_PRIVATE_KEY`

Use the GitHub App token for:

- reading PR and check metadata
- approving the PR
- enabling automerge

Do not rely on `GITHUB_TOKEN` for approval, because GitHub restrictions often prevent approving and auto-merging in the same repository flow.

### Merge Behavior

Once all guards pass:

1. auto-approve the PR
2. enable automerge with `squash`

The workflow should not directly merge. It should let GitHub perform the merge once the repository’s protection rules are satisfied.

### Failure Handling

- Guard failure: exit 0 and do nothing
- transient GitHub API or permissions failure: fail the job so operators can see it
- already approved or already automerge-enabled: treat as success

## Testing

Extend the existing CI workflow tests in [tests/unit/ci-workflow.test.ts](/home/pfk/dev/frankenbeast/.worktrees/beasts-dispatch-station/tests/unit/ci-workflow.test.ts) so the new root workflow is covered.

Key assertions:

- the new workflow file exists
- it includes both `pull_request_target` and `workflow_run`
- it gates on `autorelease: pending`
- it references the `CI` workflow
- it uses the GitHub App token action
- it auto-approves
- it enables automerge

## Notes

This change should be intentionally minimal. It does not need a generalized PR automation framework. It only needs to close the specific gap where root Release Please PRs get labeled but never progress to merge.
