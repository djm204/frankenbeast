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
      "## 2. Save the branch name and inspect local work",
      "git status --short --branch",
      "Never use `git clean -fd`",
      "## 3. Update your local main branch",
      "git merge --ff-only upstream/main",
      "git merge --ff-only origin/main",
      "## 4. Synchronize your fork",
      "Do not force-push `main`",
      "## 5. Delete only the merged contribution branch",
      'git branch -d "$CONTRIBUTION_BRANCH"',
      'LOCAL_HEAD="$(git rev-parse "$CONTRIBUTION_BRANCH")"',
      'if [ "$LOCAL_HEAD" != "$PR_HEAD" ]',
      'git branch -D "$CONTRIBUTION_BRANCH"',
      'git push origin --delete "$CONTRIBUTION_BRANCH"',
      "Do not add `--force` to worktree removal",
      "## 6. Start the next contribution from current main",
      "Do not reuse the merged branch for unrelated work",
      "## Cleanup checklist",
    ]) {
      expect(guide).toContain(expected);
    }
  });
});
