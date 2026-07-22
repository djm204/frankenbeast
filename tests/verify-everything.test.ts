import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getWorkspacePackageDirNames,
  getWorkspacePackageManifestPaths,
} from "./helpers/workspaces.js";
import { findRemovedWorkspaceReferences } from "./helpers/removed-workspace-wiring.js";
import { validateVerificationTaskWiring } from "./helpers/verification-task-wiring.js";

const ROOT = resolve(import.meta.dirname, "..");
const exec = (command: string, args: string[]) =>
  execFileSync(command, args, { cwd: ROOT, encoding: "utf8" }).trim();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const ALL_PACKAGES = getWorkspacePackageDirNames();
const REMOVED_WORKSPACES = [
  {
    dir: "frankenfirewall",
    references: [
      "frankenfirewall",
      "@franken/firewall",
      "@frankenbeast/firewall",
    ],
  },
  {
    dir: "franken-skills",
    references: ["franken-skills", "@franken/skills", "@frankenbeast/skills"],
  },
  {
    dir: "franken-heartbeat",
    references: ["franken-heartbeat", "@frankenbeast/heartbeat"],
  },
  {
    dir: "franken-mcp",
    references: ["franken-mcp", "@franken/mcp", "@frankenbeast/mcp"],
  },
  {
    dir: "franken-comms",
    references: ["franken-comms", "@frankenbeast/comms"],
  },
] as const;
const REMOVED_WORKSPACE_REFERENCES = REMOVED_WORKSPACES.flatMap(
  ({ references }) => references,
);

const isWorkspaceWiringFile = (fileName: string): boolean =>
  fileName === "package.json" ||
  fileName === "package-lock.json" ||
  fileName === "turbo.json" ||
  fileName === "release-please-config.json" ||
  fileName === ".release-please-manifest.json" ||
  /^tsconfig(?:\.[^.]+)?\.json$/u.test(fileName) ||
  /^vitest(?:\.[^.]+)*\.config(?:\.[^.]+)*\.ts$/u.test(fileName);

const getActiveWorkspaceWiringPaths = (): string[] => {
  const paths = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isWorkspaceWiringFile(entry.name))
    .map((entry) => entry.name);

  for (const manifestPath of getWorkspacePackageManifestPaths()) {
    const packageDir = manifestPath.slice(0, -"/package.json".length);
    for (const entry of readdirSync(resolve(ROOT, packageDir), {
      withFileTypes: true,
    })) {
      if (entry.isFile() && isWorkspaceWiringFile(entry.name)) {
        paths.push(`${packageDir}/${entry.name}`);
      }
    }
  }

  return [...new Set(paths)].sort();
};

type NpmLsResult = {
  status: number | null;
  stdout: string | Buffer;
  stderr?: string | Buffer;
  error?: Error;
};

type NpmLsPackage = {
  dependencies?: Record<string, NpmLsPackage>;
  invalid?: boolean;
  missing?: boolean;
  problems?: string[];
};

type RootPackageJson = {
  scripts?: Record<string, unknown>;
};

type TurboConfig = {
  tasks?: Record<string, unknown>;
};

const toOutput = (value: string | Buffer | undefined) =>
  typeof value === "string" ? value : (value?.toString("utf8") ?? "");

const hasResolvedDependency = (
  dependencyTree: NpmLsPackage,
  packageName: string,
): boolean => {
  const directDependency = dependencyTree.dependencies?.[packageName];
  if (
    directDependency &&
    !directDependency.missing &&
    !directDependency.invalid
  ) {
    return true;
  }

  return Object.values(dependencyTree.dependencies ?? {}).some((dependency) =>
    hasResolvedDependency(dependency, packageName),
  );
};

const assertFrankenTypesResolved = (result: NpmLsResult) => {
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);

  const stdout = toOutput(result.stdout);
  expect(stdout.trim()).not.toBe("");

  const parsed = JSON.parse(stdout) as NpmLsPackage;
  expect(parsed.problems ?? []).toHaveLength(0);
  expect(hasResolvedDependency(parsed, "@franken/types")).toBe(true);
};

describe("Chunk 10: full verification pass", () => {
  describe("aggregate task wiring", () => {
    it("wires build and test scripts to defined Turbo tasks", () => {
      const packageJson = JSON.parse(
        readFileSync(resolve(ROOT, "package.json"), "utf8"),
      ) as RootPackageJson;
      const turboConfig = JSON.parse(
        readFileSync(resolve(ROOT, "turbo.json"), "utf8"),
      ) as TurboConfig;

      expect(() =>
        validateVerificationTaskWiring(
          packageJson.scripts ?? {},
          turboConfig.tasks ?? {},
        ),
      ).not.toThrow();
    });
  });

  describe("verification command portability", () => {
    it("does not rely on shell pipeline parsing in the default suite", () => {
      const source = readFileSync(import.meta.filename, "utf8");
      const pipe = String.fromCharCode(124);
      const countFlag = ["--", "count"].join("");

      expect(source).not.toContain(`${pipe} wc -l`);
      expect(source).not.toContain(`${pipe} head`);
      expect(source).not.toContain(["git", "log"].join(" "));
      expect(source).not.toContain(["git", "rev-list"].join(" "));
      expect(source).not.toContain(countFlag);
      expect(source).not.toMatch(
        /to(?:Be|Equal|BeGreaterThanOrEqual)\((?:3|108|1572)\)/,
      );
      expect(source).toMatch(
        /process\.platform\s*===\s*['"]win32['"]\s*\?\s*['"]npm\.cmd['"]\s*:\s*['"]npm['"]/,
      );
    });
  });

  describe("workspace resolution", () => {
    it("accepts npm warnings when structured output proves @franken/types resolved", () => {
      expect(() =>
        assertFrankenTypesResolved({
          status: 0,
          stdout: JSON.stringify({
            dependencies: {
              "@franken/types": {
                version: "0.9.0",
              },
            },
          }),
          stderr: ["npm", "WARN", "config optional workspace warning"].join(
            " ",
          ),
        }),
      ).not.toThrow();
    });

    it("fails when structured output does not contain @franken/types", () => {
      expect(() =>
        assertFrankenTypesResolved({
          status: 0,
          stdout: JSON.stringify({
            dependencies: {},
          }),
          stderr: "",
        }),
      ).toThrow();
    });

    it("fails when structured output reports dependency problems", () => {
      expect(() =>
        assertFrankenTypesResolved({
          status: 0,
          stdout: JSON.stringify({
            problems: ["missing: @franken/types@file:packages/franken-types"],
            dependencies: {
              "@franken/types": {
                missing: true,
              },
            },
          }),
          stderr: "",
        }),
      ).toThrow();
    });

    it("npm ls @franken/types resolves without errors", () => {
      const result = spawnSync(npmCommand, ["ls", "--json", "@franken/types"], {
        cwd: ROOT,
        encoding: "utf8",
      });

      assertFrankenTypesResolved(result);
    });
  });

  describe("no gitlinks in index", () => {
    it("git ls-tree HEAD contains no mode-160000 entries", () => {
      const output = exec("git", ["ls-tree", "HEAD"]);
      const gitlinks = output
        .split("\n")
        .filter((line: string) => line.includes("160000"));
      expect(gitlinks).toHaveLength(0);
    });
  });

  describe("no root-level module directories", () => {
    for (const dir of ALL_PACKAGES) {
      it(`${dir}/ should not exist at root level`, () => {
        expect(existsSync(resolve(ROOT, dir))).toBe(false);
      });
    }
  });

  describe("removed workspace consolidation", () => {
    for (const { dir } of REMOVED_WORKSPACES) {
      it(`${dir}/ should not exist at root or under packages/`, () => {
        expect(existsSync(resolve(ROOT, dir))).toBe(false);
        expect(existsSync(resolve(ROOT, "packages", dir))).toBe(false);
      });
    }

    it("has no removed package names in active workspace wiring", () => {
      const wiringFiles = getActiveWorkspaceWiringPaths().map((path) => ({
        path,
        content: readFileSync(resolve(ROOT, path), "utf8"),
      }));

      expect(
        findRemovedWorkspaceReferences(
          wiringFiles,
          REMOVED_WORKSPACE_REFERENCES,
        ),
      ).toEqual([]);
    });
  });

  describe("no .git dirs inside packages", () => {
    for (const dir of ALL_PACKAGES) {
      it(`packages/${dir}/.git should not exist`, () => {
        expect(existsSync(resolve(ROOT, "packages", dir, ".git"))).toBe(false);
      });
    }
  });
});
