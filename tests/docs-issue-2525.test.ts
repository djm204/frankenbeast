import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const GUIDE_PATH = "docs/onboarding/ci-failure-triage.md";

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("issue #2525 first-PR CI failure triage", () => {
  it("keeps the guide discoverable from public contributor entrypoints", () => {
    expect(readText("README.md")).toContain(`(${GUIDE_PATH})`);
    expect(readText("CONTRIBUTING.md")).toContain(`(${GUIDE_PATH})`);
    expect(readText("docs/onboarding/README.md")).toContain(
      "(ci-failure-triage.md)",
    );
  });

  it("documents current-head verification, failed-log inspection, and narrow reproduction", () => {
    const guide = readText(GUIDE_PATH);

    for (const requiredText of [
      "headRefOid",
      "git rev-parse HEAD",
      "gh pr checks",
      'gh run view "$RUN_ID"',
      "--log-failed",
      "npm run test:root",
      "npm run typecheck --workspace",
      "Every push creates a new head",
    ]) {
      expect(guide).toContain(requiredText);
    }
  });

  it("prevents blind reruns, unrelated fixes, and unsafe public logs", () => {
    const guide = readText(GUIDE_PATH);

    expect(guide).toContain(
      "Do not rerun jobs repeatedly before understanding the failure.",
    );
    expect(guide).toContain("do not bundle an unrelated fix");
    expect(guide).toContain(
      "remove provider keys, tokens, webhook URLs, `.env` values",
    );
    expect(guide).toContain("Re-run failed jobs");
    expect(guide).toContain(
      "Do not repeatedly rerun deterministic test, lint, typecheck, or build failures.",
    );
  });
});
