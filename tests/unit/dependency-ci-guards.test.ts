import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");
const OUTDATED_SCRIPT = resolve(ROOT, "scripts/check-major-outdated.mjs");
const DEPENDABOT_SUPPLY_CHAIN_SCRIPT = resolve(
  ROOT,
  "scripts/check-dependabot-supply-chain.mjs",
);
const DEPENDENCY_VULNERABILITY_SLA_SCRIPT = resolve(
  ROOT,
  "scripts/dependency-vulnerability-sla.mjs",
);
const fixtureRoots = new Set<string>();

function cleanupFixtureRoots() {
  for (const dir of fixtureRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
  fixtureRoots.clear();
}

function writeFixtureFile(
  prefix:
    "franken-outdated-" | "franken-dependabot-" | "franken-vulnerability-sla-",
  filename: string,
  content: string,
) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  fixtureRoots.add(dir);
  const file = join(dir, filename);
  writeFileSync(file, content, "utf8");
  return { dir, file };
}

function writeJson(value: unknown, filename = "outdated.json") {
  return writeFixtureFile(
    "franken-outdated-",
    filename,
    `${JSON.stringify(value, null, 2)}\n`,
  ).file;
}

function writeSlaJson(value: unknown, filename = "audit.json") {
  return writeFixtureFile(
    "franken-vulnerability-sla-",
    filename,
    `${JSON.stringify(value, null, 2)}\n`,
  ).file;
}

function writeText(content: string, filename: string) {
  return writeFixtureFile("franken-dependabot-", filename, content).file;
}

afterEach(cleanupFixtureRoots);

function runOutdatedGuard(report: unknown, baseline: unknown = []) {
  return spawnSync(
    process.execPath,
    [
      OUTDATED_SCRIPT,
      "--input",
      writeJson(report),
      "--baseline",
      writeJson(baseline, "baseline.json"),
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
}

function runDependabotSupplyChainGuard(config: string) {
  return spawnSync(
    process.execPath,
    [
      DEPENDABOT_SUPPLY_CHAIN_SCRIPT,
      "--config",
      writeText(config, "dependabot.yml"),
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
}

function runVulnerabilitySlaReport(audit: unknown, extraArgs: string[] = []) {
  return spawnSync(
    process.execPath,
    [
      DEPENDENCY_VULNERABILITY_SLA_SCRIPT,
      "--audit-input",
      writeSlaJson(audit),
      ...extraArgs,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
}

function runVulnerabilitySlaNpmScript(audit: unknown, extraArgs: string[] = []) {
  return spawnSync(
    "npm",
    [
      "--silent",
      "run",
      "deps:vulnerability-sla",
      "--",
      "--audit-input",
      writeSlaJson(audit),
      ...extraArgs,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
}

describe("dependency CI guards for issue #1414", () => {
  it("removes tracked temp fixture roots even when assertions fail before guard execution", () => {
    const outdatedFixture = writeFixtureFile(
      "franken-outdated-",
      "outdated.json",
      "{}\n",
    );
    const dependabotFixture = writeFixtureFile(
      "franken-dependabot-",
      "dependabot.yml",
      "version: 2\n",
    );

    expect(existsSync(outdatedFixture.dir)).toBe(true);
    expect(existsSync(dependabotFixture.dir)).toBe(true);

    cleanupFixtureRoots();

    expect(existsSync(outdatedFixture.dir)).toBe(false);
    expect(existsSync(dependabotFixture.dir)).toBe(false);
  });

  it("fails only for dependencies with latest versions on a newer major", () => {
    const result = runOutdatedGuard({
      acorn: {
        current: "8.17.0",
        wanted: "8.17.1",
        latest: "8.17.1",
        location: "node_modules/acorn",
      },
      vite: {
        current: "8.1.3",
        wanted: "9.0.0",
        latest: "9.0.0",
        location: "node_modules/vite",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("vite");
    expect(result.stderr).toContain("current 8.1.3");
    expect(result.stderr).not.toContain("acorn");
  });

  it("flattens npm workspace arrays before checking major gaps", () => {
    const result = runOutdatedGuard({
      zod: [
        {
          current: "3.25.0",
          wanted: "4.0.0",
          latest: "4.2.0",
          location: "packages/franken-web/node_modules/zod",
        },
        {
          current: "3.25.0",
          wanted: "3.25.1",
          latest: "4.2.0",
          location: "packages/franken-orchestrator/node_modules/zod",
        },
      ],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("zod");
    expect(result.stderr).toContain("packages/franken-web");
  });

  it("fails closed when npm outdated returns an error JSON object", () => {
    const result = runOutdatedGuard({
      error: { code: "E403", summary: "forbidden" },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("npm outdated reported an error");
    expect(result.stderr).toContain("E403");
  });

  it("passes when existing direct major gaps match the approved baseline", () => {
    const report = {
      react: {
        current: "18.3.1",
        wanted: "18.3.1",
        latest: "19.2.7",
        location: "packages/franken-web/node_modules/react",
        dependent: "franken-web",
      },
    };

    const result = runOutdatedGuard(report, [
      {
        name: "react",
        dependent: "franken-web",
        location: "packages/franken-web/node_modules/react",
        currentMajor: 18,
        latestMajor: 19,
      },
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("baseline-approved major gap");
  });

  it("does not let one baseline entry approve another workspace location", () => {
    const result = runOutdatedGuard(
      {
        react: [
          {
            current: "18.3.1",
            wanted: "18.3.1",
            latest: "19.2.7",
            location: "node_modules/react",
            dependent: "franken-web",
          },
          {
            current: "18.3.1",
            wanted: "18.3.1",
            latest: "19.2.7",
            location: "node_modules/react",
            dependent: "franken-new",
          },
        ],
      },
      [
        {
          name: "react",
          dependent: "franken-web",
          location: "node_modules/react",
          currentMajor: 18,
          latestMajor: 19,
        },
      ],
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("franken-new");
    expect(result.stderr).toContain("node_modules/react");
  });

  it("passes when dependencies are only behind within their current major", () => {
    const result = runOutdatedGuard({
      typescript: {
        current: "5.9.3",
        wanted: "5.9.4",
        latest: "5.9.4",
        location: "node_modules/typescript",
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "no unapproved direct dependencies are behind the latest major release",
    );
  });

  it("fails dependabot configs that allow registry-driven internal workspace updates", () => {
    const result = runDependabotSupplyChainGuard(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    groups:
      all-npm:
        patterns:
          - "*"
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("@franken/*");
    expect(result.stderr).toContain("exclude-patterns");
    expect(result.stderr).toContain("must ignore");
  });

  it("fails internal-scope ignores that only cover filtered update PRs", () => {
    const result = runDependabotSupplyChainGuard(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    groups:
      external-npm:
        patterns: ["*"]
        exclude-patterns: ["@franken/*"]
    ignore:
      - dependency-name: "@franken/*"
        update-types:
          - "version-update:semver-major"
          - "version-update:semver-minor"
          - "version-update:semver-patch"
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("without update-types filters");

    const versionFiltered = runDependabotSupplyChainGuard(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    groups:
      external-npm:
        patterns: ["*"]
        exclude-patterns: ["@franken/*"]
    ignore:
      - dependency-name: "@franken/*"
        versions: ["<1.0.0"]
`);

    expect(versionFiltered.status).toBe(1);
    expect(versionFiltered.stderr).toContain("without update-types filters");
  });

  it("fails npm entries that target release branches instead of default-branch security coverage", () => {
    const result = runDependabotSupplyChainGuard(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    target-branch: release/0.45
    groups:
      external-npm:
        patterns: ["*"]
        exclude-patterns: ["@franken/*"]
    ignore:
      - dependency-name: "@franken/*"
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("target-branch");
    expect(result.stderr).toContain("default branch");
  });

  it("fails every npm group that lacks an internal-scope exclusion", () => {
    const result = runDependabotSupplyChainGuard(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    groups:
      safe-inline:
        patterns: ["*"]
        exclude-patterns: ["@franken/*"]
      unsafe-production:
        dependency-type: production
    ignore:
      - dependency-name: "@franken/*"
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unsafe-production");
    expect(result.stderr).toContain("exclude-patterns");
  });

  it("accepts dependabot configs that exclude internal packages from all npm updates", () => {
    const result = runDependabotSupplyChainGuard(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    groups:
      external-npm:
        patterns: ["*"]
        exclude-patterns: ["@franken/*"]
      production-only:
        dependency-type: production
        exclude-patterns: ["@franken/*"]
    ignore:
      - dependency-name: "@franken/*"
`);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Dependabot supply-chain guard OK");
  });

  it("emits a human dependency vulnerability SLA dashboard with age, fixed version, path, and links", () => {
    const state = writeSlaJson(
      {
        findings: [
          {
            key: "vite|high|<8.1.3|https://github.com/advisories/GHSA-test",
            package: "vite",
            firstSeen: "2026-06-01",
          },
        ],
      },
      "state.json",
    );
    const links = writeSlaJson(
      {
        links: [
          {
            package: "vite",
            issue: 1673,
            pr: "https://github.com/djm204/frankenbeast/pull/1",
          },
        ],
      },
      "links.json",
    );
    const result = runVulnerabilitySlaReport(
      {
        metadata: { vulnerabilities: { high: 1, total: 1 } },
        vulnerabilities: {
          vite: {
            name: "vite",
            severity: "high",
            range: "<8.1.3",
            nodes: ["node_modules/vite"],
            effects: ["@vitejs/plugin-react"],
            fixAvailable: {
              name: "vite",
              version: "8.1.3",
              isSemVerMajor: false,
            },
            via: [
              {
                source: 123,
                name: "vite",
                title: "dev server bypass",
                url: "https://github.com/advisories/GHSA-test",
                range: "<8.1.3",
                severity: "high",
              },
            ],
          },
        },
      },
      [
        "--state",
        state,
        "--links",
        links,
        "--now",
        "2026-07-15",
        "--no-fail-on-sla",
      ],
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Dependency vulnerability SLA dashboard");
    expect(result.stdout).toContain("HIGH");
    expect(result.stdout).toContain("vite");
    expect(result.stdout).toContain("<8.1.3 -> 8.1.3");
    expect(result.stdout).toContain("44d/30 OVER");
    expect(result.stdout).toContain("node_modules/vite");
    expect(result.stdout).toContain("#1673");
    expect(result.stdout).toContain(
      "https://github.com/djm204/frankenbeast/pull/1",
    );
  });

  it("fails critical and high dependency vulnerabilities that exceed the SLA in JSON mode", () => {
    const state = writeSlaJson(
      {
        findings: [
          {
            key: "protobufjs|critical|<7.6.5|no-advisory",
            package: "protobufjs",
            firstSeen: "2026-07-01",
          },
        ],
      },
      "state.json",
    );
    const result = runVulnerabilitySlaReport(
      {
        metadata: { vulnerabilities: { critical: 1, total: 1 } },
        vulnerabilities: {
          protobufjs: {
            severity: "critical",
            range: "<7.6.5",
            nodes: ["node_modules/protobufjs"],
            fixAvailable: { name: "@anthropic-ai/sdk", version: "0.110.0" },
            via: ["@anthropic-ai/sdk"],
          },
        },
      },
      ["--state", state, "--now", "2026-07-15", "--format", "json"],
    );

    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout) as {
      findings: Array<{
        package: string;
        ageDays: number;
        overSla: boolean;
        fixedVersion: string;
      }>;
    };
    expect(report.findings[0]).toMatchObject({
      package: "protobufjs",
      ageDays: 14,
      fixedVersion: "@anthropic-ai/sdk@0.110.0",
      overSla: true,
    });
    expect(result.stderr).toContain("Dependency vulnerability SLA exceeded");
  });

  it("rejects invalid npm audit error objects unless explicitly marked unknown", () => {
    const invalid = {
      error: { code: "EAUDIT", summary: "registry unavailable" },
    };
    const rejected = runVulnerabilitySlaReport(invalid, ["--format", "json"]);

    expect(rejected.status).toBe(2);
    expect(rejected.stderr).toContain("metadata and vulnerabilities");

    const tolerated = runVulnerabilitySlaReport(invalid, [
      "--format",
      "json",
      "--allow-invalid-audit",
      "--no-fail-on-sla",
    ]);
    expect(tolerated.status).toBe(0);
    const report = JSON.parse(tolerated.stdout) as {
      auditStatus: string;
      auditError: string;
      findings: unknown[];
    };
    expect(report.auditStatus).toBe("unknown");
    expect(report.auditError).toContain("metadata and vulnerabilities");
    expect(report.findings).toHaveLength(0);
  });

  it("starts new SLA findings at the current run and does not invent fixed versions", () => {
    const result = runVulnerabilitySlaReport(
      {
        metadata: { vulnerabilities: { high: 1, total: 1 } },
        vulnerabilities: {
          leftpad: {
            severity: "high",
            range: "<2.0.0",
            nodes: ["node_modules/leftpad"],
            fixAvailable: false,
            via: [{ title: "unpatched", range: "<2.0.0", severity: "high" }],
          },
        },
      },
      ["--now", "2026-07-15", "--format", "json"],
    );

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      ageSource: string;
      findings: Array<{
        ageDays: number;
        firstSeen: string;
        fixedVersion: string | null;
        overSla: boolean;
        isNew: boolean;
      }>;
    };
    expect(report.ageSource).toBe("current-run");
    expect(report.findings[0]).toMatchObject({
      ageDays: 0,
      firstSeen: "2026-07-15",
      fixedVersion: null,
      overSla: false,
      isNew: true,
    });
  });

  it("keeps npm-script JSON SLA output parseable", () => {
    const result = runVulnerabilitySlaNpmScript(
      {
        metadata: { vulnerabilities: { total: 0 } },
        vulnerabilities: {},
      },
      ["--format", "json"],
    );

    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stdout).not.toContain("matches packageManager");
  });

  it("preserves SLA age across advisory severity changes", () => {
    const state = writeSlaJson(
      {
        findings: [
          {
            key: "leftpad|high|<2.0.0|https://github.com/advisories/GHSA-leftpad",
            package: "leftpad",
            severity: "high",
            advisoryKeys: ["https://github.com/advisories/GHSA-leftpad"],
            firstSeen: "2026-06-01",
          },
        ],
      },
      "state.json",
    );
    const result = runVulnerabilitySlaReport(
      {
        metadata: { vulnerabilities: { critical: 1, total: 1 } },
        vulnerabilities: {
          leftpad: {
            severity: "critical",
            range: "<2.0.0",
            nodes: ["node_modules/leftpad"],
            fixAvailable: false,
            via: [
              {
                url: "https://github.com/advisories/GHSA-leftpad",
                severity: "critical",
              },
            ],
          },
        },
      },
      ["--state", state, "--now", "2026-07-15", "--format", "json"],
    );

    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ ageDays: number; firstSeen: string; isNew: boolean }>;
    };
    expect(report.findings[0]).toMatchObject({
      ageDays: 44,
      firstSeen: "2026-06-01",
      isNew: false,
    });
  });

  it("can fail fresh critical/high dependency findings before SLA aging", () => {
    const result = runVulnerabilitySlaReport(
      {
        metadata: { vulnerabilities: { high: 1, total: 1 } },
        vulnerabilities: {
          leftpad: {
            severity: "high",
            range: "<2.0.0",
            nodes: ["node_modules/leftpad"],
            fixAvailable: false,
            via: [{ url: "https://github.com/advisories/GHSA-leftpad" }],
          },
        },
      },
      [
        "--now",
        "2026-07-15",
        "--format",
        "json",
        "--fail-on-new-critical-high",
      ],
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("New critical/high dependency vulnerability");
  });

  it("fails closed when a requested SLA state file is missing", () => {
    const audit = writeSlaJson({
      metadata: { vulnerabilities: { high: 1, total: 1 } },
      vulnerabilities: {
        vite: {
          severity: "high",
          range: "<8.1.3",
          nodes: ["node_modules/vite"],
          fixAvailable: true,
          via: [],
        },
      },
    });
    const missingState = join(
      tmpdir(),
      `franken-missing-state-${process.pid}-${Date.now()}.json`,
    );
    const result = spawnSync(
      process.execPath,
      [
        DEPENDENCY_VULNERABILITY_SLA_SCRIPT,
        "--audit-input",
        audit,
        "--state",
        missingState,
      ],
      { cwd: ROOT, encoding: "utf8" },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Requested dependency SLA state file does not exist",
    );
  });

  it("wires dependency audit, major outdated check, dependabot guard, and SBOM artifact generation into CI", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(ROOT, "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const workflow = readFileSync(
      resolve(ROOT, ".github/workflows/ci.yml"),
      "utf8",
    );

    expect(packageJson.scripts?.["audit:dependencies"]).toBe(
      "node scripts/check-package-manager.mjs && npm audit",
    );
    expect(packageJson.scripts?.["deps:vulnerability-sla"]).toBe(
      "node scripts/check-package-manager.mjs --quiet && node scripts/dependency-vulnerability-sla.mjs",
    );
    expect(packageJson.scripts?.["deps:outdated:major"]).toBe(
      "node scripts/check-major-outdated.mjs",
    );
    expect(packageJson.scripts?.["check:dependabot-supply-chain"]).toBe(
      "node scripts/check-dependabot-supply-chain.mjs",
    );
    expect(workflow).toContain("actions/cache/restore@v4");
    expect(workflow).toContain("dependency-vulnerability-sla-state.json");
    expect(workflow).toContain("scripts/dependency-vulnerability-sla.mjs");
    expect(workflow).toContain("--fail-on-new-critical-high");
    expect(
      workflow.indexOf("Dependency vulnerability SLA dashboard"),
    ).toBeLessThan(workflow.indexOf("npm run audit:dependencies"));
    expect(workflow).toContain("npm run audit:dependencies -- --json");
    expect(workflow).toContain("npm run audit:security -- --json");
    expect(workflow).toContain("|| true");
    expect(workflow).toContain("npm run deps:outdated:major");
    expect(workflow).toContain("npm run check:dependabot-supply-chain");
    expect(workflow).toContain("npm sbom --sbom-format cyclonedx");
    expect(workflow).toContain("actions/upload-artifact@v7");
    expect(workflow).toContain("dependency-sbom-cyclonedx");
  });
});
