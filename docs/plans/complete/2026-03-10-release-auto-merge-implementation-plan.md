# Release Auto-Merge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add root-level Release Please auto-merge that only approves and enables automerge after CI succeeds.

**Architecture:** Add a dedicated root workflow that listens to Release Please PR events and root CI completion, resolves the candidate release PR, verifies strict guards, and then uses the repo GitHub App token to auto-approve and enable automerge. Extend the existing workflow test suite so the new workflow contract is locked down.

**Tech Stack:** GitHub Actions YAML, GitHub App auth actions, bash, Vitest

---

### Task 1: Extend workflow tests for root release auto-merge

**Files:**
- Modify: `tests/unit/ci-workflow.test.ts`

**Step 1: Write the failing tests**

Add assertions for:

```ts
expect(existsSync(RELEASE_AUTO_MERGE_PATH)).toBe(true);
expect(content).toContain('pull_request_target:');
expect(content).toContain('workflow_run:');
expect(content).toContain('autorelease: pending');
expect(content).toContain('workflows: [CI]');
expect(content).toContain('actions/create-github-app-token');
expect(content).toContain('hmarr/auto-approve-action');
expect(content).toContain('peter-evans/enable-pull-request-automerge');
```

**Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/unit/ci-workflow.test.ts`
Expected: FAIL because the root auto-merge workflow does not exist yet

**Step 3: Commit after green later**

Do not commit yet; pair with Task 2 implementation.

### Task 2: Add the root release auto-merge workflow

**Files:**
- Create: `.github/workflows/release-auto-merge.yml`

**Step 1: Implement the workflow minimally**

Include:

- `pull_request_target` trigger for `opened`, `reopened`, `synchronize`, `labeled`
- `workflow_run` trigger for `CI`
- permissions for `contents`, `pull-requests`, and `checks`
- a guard step that resolves a PR candidate and exits cleanly when not eligible
- GitHub App token generation via `actions/create-github-app-token@v1`
- approval via `hmarr/auto-approve-action@v4`
- automerge enable via `peter-evans/enable-pull-request-automerge@v3`

The workflow should only proceed when:

- base branch is `main`
- label `autorelease: pending` is present
- PR is open and not draft
- head branch matches `release-please--`
- CI/check conclusions are successful

**Step 2: Re-run the focused test**

Run: `npm test -- tests/unit/ci-workflow.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/unit/ci-workflow.test.ts .github/workflows/release-auto-merge.yml
git commit -m "ci: auto-merge release please prs after ci"
```

### Task 3: Verify root automation scripts still pass

**Files:**
- Verify only

**Step 1: Run broader verification**

Run:

```bash
npm test -- tests/unit/ci-workflow.test.ts tests/unit/release-please-config.test.ts
```

Expected: PASS

**Step 2: Run full repo verification**

Run:

```bash
npm test
npm run typecheck
```

Expected: PASS

**Step 3: Push and update PR**

```bash
git push
```
