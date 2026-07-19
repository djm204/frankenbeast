import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const GUIDE_PATH = "docs/onboarding/after-your-first-pr.md";

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("issue #2527 first-PR completion path", () => {
  it("is discoverable from contributor onboarding entrypoints", () => {
    expect(readText("README.md")).toContain(`(${GUIDE_PATH})`);
    expect(readText("CONTRIBUTING.md")).toContain(`(${GUIDE_PATH})`);
    expect(readText("docs/onboarding/README.md")).toContain(
      "(after-your-first-pr.md)",
    );
  });

  it("provides a safe, complete post-merge cleanup workflow", () => {
    const guide = readText(GUIDE_PATH);

    for (const expected of [
      "title: After your first pull request",
      "# After your first pull request",
      "## 1. Confirm the pull request and issue are finished",
      'gh pr view "$PR_NUMBER"',
      'gh issue view "$ISSUE_NUMBER"',
      "## 2. Save and verify the contribution branch",
      "git status --short --branch",
      'LOCAL_HEAD="$(git rev-parse HEAD)"',
      'PR_BRANCH="$(gh pr view "$PR_NUMBER"',
      'if [ "$CONTRIBUTION_BRANCH" != "$PR_BRANCH" ]',
      'if [ "$LOCAL_HEAD" != "$PR_HEAD" ]',
      "before any local or remote branch deletion",
      "Never use `git clean -fd`",
      "## 3. Leave or remove the contribution checkout",
      'test -f "$CONTRIBUTION_ROOT/.git"',
      'git worktree remove "$CONTRIBUTION_ROOT"',
      "Do not add `--force` to worktree removal",
      "## 4. Update your local main branch",
      'git -C "$PRIMARY_CHECKOUT" merge --ff-only upstream/main',
      'git -C "$PRIMARY_CHECKOUT" merge --ff-only origin/main',
      'test "$(git -C "$PRIMARY_CHECKOUT" branch --show-current)" = "main"',
      "## 5. Synchronize your fork",
      "Do not force-push `main`",
      "## 6. Delete only the verified merged branch",
      'branch -d "$CONTRIBUTION_BRANCH"',
      'branch -D "$CONTRIBUTION_BRANCH"',
      'if REMOTE_OUTPUT="$(git -C "$PRIMARY_CHECKOUT" ls-remote --exit-code',
      'elif [ "$REMOTE_LOOKUP_STATUS" -ne 0 ]',
      'push origin --delete "$CONTRIBUTION_BRANCH"',
      "## 7. Start the next contribution from current main",
      "Do not reuse the merged branch for unrelated work",
      "## Cleanup checklist",
    ]) {
      expect(guide).toContain(expected);
    }
  });
});
