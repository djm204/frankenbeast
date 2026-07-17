import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const guidePath = "docs/onboarding/release-deployment-mental-model.md";

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("issue #1735 release and deployment mental model docs", () => {
  it("links the mental model from onboarding, README, and the issue workflow entrypoint", () => {
    const onboarding = readText("ONBOARDING.md");
    const readme = readText("README.md");
    const issueGuide = readText("docs/guides/fix-github-issues.md");

    expect(onboarding).toContain(
      "[release and deployment mental model](docs/onboarding/release-deployment-mental-model.md)",
    );
    expect(onboarding).toContain(
      "issue->PR->CI->Codex->merge->Release Please->deployment flow",
    );
    expect(readme).toContain(
      "[release and deployment mental model](docs/onboarding/release-deployment-mental-model.md)",
    );
    expect(issueGuide).toContain(
      "[release and deployment mental model](../onboarding/release-deployment-mental-model.md)",
    );
  });

  it("documents the full issue-to-release lifecycle and release labels", () => {
    const guide = readText(guidePath);

    for (const requiredHeading of [
      "# Release and deployment mental model",
      "## One-screen lifecycle",
      "## Issue to PR to merge flow",
      "## Release labels and signals",
      "## What happens after merge",
      "## Deployment and monitoring ownership",
      "## Rollback and incident expectations",
      "## Negative cases for contributors and agents",
    ]) {
      expect(guide).toContain(requiredHeading);
    }

    for (const requiredText of [
      "Issue triage",
      "Branch and worktree",
      "Local verification",
      "CI and Codex review",
      "current-head `@codex review` clean",
      "Release Please",
      "Conventional Commit type",
      "autorelease: pending",
      "autorelease: tagged",
      "deploy-beasts",
      "Priority labels such as `P0` / `P1` / `P2` / `P3`",
      "Do not infer semver impact from priority alone",
    ]) {
      expect(guide).toContain(requiredText);
    }
  });

  it("links PR workflow, release automation, rollback, and security references", () => {
    const guide = readText(guidePath);

    for (const requiredLink of [
      "[coding-agent PR etiquette guide](./coding-agent-pr-etiquette.md)",
      "[`release-please-config.json`](../../release-please-config.json)",
      "[`SECURITY.md`](../../SECURITY.md)",
      "[worker push rollback runbook](../runbooks/worker-push-rollback.md)",
    ]) {
      expect(guide).toContain(requiredLink);
    }

    for (const requiredText of [
      "Post-merge monitoring is owned by the surface owner or delegated closer named in the PR handoff.",
      "Prefer a forward fix or revert PR when the change has already merged",
      "Record who owns follow-up monitoring and what signal proves recovery",
      "Do not run destructive rollback commands from a worker shell without the approved runbook path.",
    ]) {
      expect(guide).toContain(requiredText);
    }
  });
});
