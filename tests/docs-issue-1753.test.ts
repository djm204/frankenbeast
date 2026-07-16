import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const policyPath = "docs/dr/backup-ownership-retention-policy.md";

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("issue #1753 backup ownership and retention policy docs", () => {
  it("documents backup ownership, locations, retention, encryption, cadence, and deletion", () => {
    const policy = read(policyPath);

    for (const heading of [
      "# Backup ownership and retention policy",
      "## Ownership and escalation",
      "## Backup inventory",
      "## Sensitive data retention limits",
      "## Verification and restore command references",
      "## Deletion workflow",
      "## Audit checklist",
    ]) {
      expect(policy).toContain(heading);
    }

    for (const requiredColumn of [
      "Backup type",
      "Owner",
      "Allowed location",
      "Retention window",
      "Encryption expectation",
      "Restore test cadence",
      "Deletion process",
    ]) {
      expect(policy).toContain(requiredColumn);
    }
  });

  it("maps sensitive backup data classes to explicit retention limits", () => {
    const policy = read(policyPath);

    for (const dataClass of [
      "`secret`",
      "`user-private`",
      "`sensitive`",
      "`internal`",
      "`public`",
    ]) {
      expect(policy).toContain(dataClass);
    }

    expect(policy).toContain("docs/runtime-artifact-data-classification.md");
    expect(policy).toContain("highest-sensitivity class");
    expect(policy).toContain("Maximum retention");
  });

  it("links operators to restore commands, planned tooling issues, and emergency escalation guidance", () => {
    const policy = read(policyPath);

    for (const requiredText of [
      "docs/dr/restore-preview.md",
      "docs/dr/tabletop-exercise-template.md",
      "docs/dr/incident-command-checklist.md",
      "npm run dr:runtime-config-rollback:dry-run",
      "npm run dr:worker-push-rollback:dry-run",
      "https://github.com/djm204/frankenbeast/issues/1835",
      "https://github.com/djm204/frankenbeast/issues/1839",
      "If either owner is unavailable for 30 minutes during an active incident",
    ]) {
      expect(policy).toContain(requiredText);
    }
  });
});
