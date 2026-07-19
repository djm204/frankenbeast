import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const GUIDE_PATH = "docs/onboarding/pull-request-self-review.md";

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("issue #2526 pull-request self-review path", () => {
  it("is discoverable from contributor onboarding entrypoints", () => {
    expect(readText("CONTRIBUTING.md")).toContain(`(${GUIDE_PATH})`);
    expect(readText("docs/onboarding/README.md")).toContain(
      "(pull-request-self-review.md)",
    );
  });

  it("provides a complete and safe first-time self-review workflow", () => {
    const guide = readText(GUIDE_PATH);

    for (const expected of [
      "title: Pull request self-review checklist",
      "# Pull request self-review checklist",
      "## 1. Confirm the issue and branch scope",
      'gh issue view "$ISSUE_NUMBER"',
      'gh pr list --repo "$REPO" --state open',
      "## 2. Review every local change",
      "git status --short",
      "git diff --check",
      'git diff --stat "$BASE_REF...HEAD"',
      'git diff "$BASE_REF...HEAD"',
      'git log --oneline "$BASE_REF..HEAD"',
      "Do not use `git add .`",
      "## 3. Check for unsafe or accidental files",
      ".env",
      ".fbeast/",
      "## 4. Rerun and record verification",
      "Do not claim a skipped or failed check passed",
      "## 5. Inspect the pull request GitHub will review",
      'gh pr view "$PR_NUMBER"',
      'gh pr diff "$PR_NUMBER"',
      'gh pr checks "$PR_NUMBER"',
      "Closes #<issue-number>",
      "## Ready-for-review checklist",
      "current head",
    ]) {
      expect(guide).toContain(expected);
    }
  });
});
