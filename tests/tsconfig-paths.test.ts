import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJson, getWorkspacePackages } from "./helpers/workspaces.js";

const hasTypeScriptSource = (relDir: string): boolean => {
  const absDir = join(ROOT, relDir);
  if (!existsSync(absDir)) return false;

  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const relPath = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      if (hasTypeScriptSource(relPath)) return true;
      continue;
    }

    if (entry.isFile() && /\.(?:[cm]?ts|tsx)$/u.test(entry.name)) {
      return true;
    }
  }

  return false;
};

const workspacePackages = getWorkspacePackages();

const EXPECTED_ALIASES: Record<string, string> = {
  "@franken/brain": "./packages/franken-brain/src/index.ts",
  "@franken/planner": "./packages/franken-planner/src/index.ts",
  "@franken/observer": "./packages/franken-observer/src/index.ts",
  "@franken/critique": "./packages/franken-critique/src/index.ts",
  "@franken/governor": "./packages/franken-governor/src/index.ts",
  "@franken/types/path-containment":
    "./packages/franken-types/src/path-containment.ts",
  "@franken/types/json-pointer":
    "./packages/franken-types/src/json-pointer.ts",
  "@franken/types/utils": "./packages/franken-types/src/utils/index.ts",
  "@franken/types": "./packages/franken-types/src/index.ts",
  "@franken/orchestrator": "./packages/franken-orchestrator/src/index.ts",
};

const ALIASED_WORKSPACE_PACKAGES = new Set(
  workspacePackages
    .filter((workspacePackage) =>
      Object.keys(EXPECTED_ALIASES).some(
        (alias) =>
          alias === workspacePackage.name ||
          alias.startsWith(`${workspacePackage.name}/`),
      ),
    )
    .map((workspacePackage) => workspacePackage.name),
);

const PATH_ALIAS_ALLOWLIST: Record<string, string> = {
  "@franken/live-bench":
    "CLI-only benchmark workspace; consumers should use the package build/bin instead of a root source alias.",
  "@franken/mcp-suite":
    "CLI/server package with package-level Vitest aliases; no root @franken source alias is exported intentionally.",
  "@franken/web":
    "Vite application workspace, not an importable library entrypoint.",
};

const TSCONFIG_TEST_INCLUDE_ALLOWLIST: Record<string, string> = {
  "@franken/live-bench":
    "Uses a package-level tsconfig/vitest boundary for src and tests; the root tsconfig.test.json cannot model its CLI package settings.",
  "@franken/mcp-suite":
    "Uses a package-level tsconfig/vitest boundary for src and tests; the root tsconfig.test.json cannot model its CLI/server package settings.",
};

describe("tsconfig.json path aliases", () => {
  const tsconfig = readJson("tsconfig.json");
  const paths = tsconfig.compilerOptions?.paths;

  it("has paths defined", () => {
    expect(paths).toBeDefined();
  });

  it("has the expected aliases", () => {
    expect(Object.keys(paths)).toHaveLength(
      Object.keys(EXPECTED_ALIASES).length,
    );
  });

  for (const [alias, expectedPath] of Object.entries(EXPECTED_ALIASES)) {
    it(`${alias} -> ${expectedPath}`, () => {
      expect(paths[alias]).toEqual([expectedPath]);
    });
  }

  it("exposes only @franken-scoped first-party aliases", () => {
    expect(Object.keys(paths).sort()).toEqual(
      Object.keys(EXPECTED_ALIASES).sort(),
    );
    for (const alias of Object.keys(paths)) {
      expect(alias, `${alias} must use the canonical @franken scope`).toMatch(
        /^@franken\//,
      );
    }
  });

  it("keeps every source workspace either aliased or explicitly allowlisted", () => {
    for (const workspacePackage of workspacePackages) {
      if (!hasTypeScriptSource(`${workspacePackage.dir}/src`)) continue;
      const isAliased = ALIASED_WORKSPACE_PACKAGES.has(workspacePackage.name);
      const allowlistReason = PATH_ALIAS_ALLOWLIST[workspacePackage.name];

      expect(
        isAliased || allowlistReason !== undefined,
        `${workspacePackage.name} (${workspacePackage.dir}) is missing from tsconfig.json paths; add an alias or document it in PATH_ALIAS_ALLOWLIST`,
      ).toBe(true);
    }
  });

  it("has no stale path alias allowlist entries", () => {
    const workspacePackageNames = new Set(
      workspacePackages.map((workspacePackage) => workspacePackage.name),
    );
    for (const [packageName, reason] of Object.entries(PATH_ALIAS_ALLOWLIST)) {
      expect(
        workspacePackageNames.has(packageName),
        `${packageName} is no longer a workspace package`,
      ).toBe(true);
      expect(
        ALIASED_WORKSPACE_PACKAGES.has(packageName),
        `${packageName} now has a root alias; remove it from PATH_ALIAS_ALLOWLIST`,
      ).toBe(false);
      expect(
        reason.trim(),
        `${packageName} allowlist entry must explain why no root alias is expected`,
      ).not.toBe("");
    }
  });

  it("has no root-level module paths (no ./franken-* or ./frankenfirewall/)", () => {
    const raw = readFileSync(join(ROOT, "tsconfig.json"), "utf8");
    // Should not match paths like "./franken-brain/" or "./frankenfirewall/"
    // but should match "./packages/franken-brain/" etc.
    expect(raw).not.toMatch(/"\.\/franken-[^"]*\/src/);
    expect(raw).not.toMatch(/"\.\/frankenfirewall\/src/);
  });

  it("keeps include as empty array", () => {
    expect(tsconfig.include).toEqual([]);
  });
});

describe("tsconfig.test.json includes", () => {
  const tsconfigTest = readJson("tsconfig.test.json");
  const includes = tsconfigTest.include;

  it("has include array", () => {
    expect(includes).toBeDefined();
    expect(Array.isArray(includes)).toBe(true);
  });

  it("includes tests/**/*", () => {
    expect(includes).toContain("tests/**/*");
  });

  it("includes or explicitly allowlists every workspace package with TypeScript source in src/", () => {
    const missingPackages = workspacePackages
      .filter((workspacePackage) =>
        hasTypeScriptSource(`${workspacePackage.dir}/src`),
      )
      .filter(
        (workspacePackage) =>
          !includes.includes(`${workspacePackage.dir}/src/**/*`),
      )
      .filter(
        (workspacePackage) =>
          TSCONFIG_TEST_INCLUDE_ALLOWLIST[workspacePackage.name] === undefined,
      );

    expect(
      missingPackages.map((workspacePackage) => workspacePackage.name),
      "Workspace packages with TypeScript source must be included in tsconfig.test.json or intentionally allowlisted by this test",
    ).toEqual([]);
  });

  it("has no stale tsconfig.test include allowlist entries", () => {
    const workspacePackageNames = new Set(
      workspacePackages.map((workspacePackage) => workspacePackage.name),
    );
    for (const [packageName, reason] of Object.entries(
      TSCONFIG_TEST_INCLUDE_ALLOWLIST,
    )) {
      expect(
        workspacePackageNames.has(packageName),
        `${packageName} is no longer a workspace package`,
      ).toBe(true);
      const workspacePackage = workspacePackages.find(
        (candidate) => candidate.name === packageName,
      );
      expect(
        includes.includes(`${workspacePackage?.dir}/src/**/*`),
        `${packageName} is now included in tsconfig.test.json; remove it from TSCONFIG_TEST_INCLUDE_ALLOWLIST`,
      ).toBe(false);
      expect(
        reason.trim(),
        `${packageName} tsconfig.test include allowlist entry must explain the exclusion`,
      ).not.toBe("");
    }
  });

  it("has no stale workspace package src includes", () => {
    const workspacePackageDirs = new Set(
      workspacePackages.map((workspacePackage) => workspacePackage.dir),
    );
    const staleIncludes = includes
      .filter(
        (include: string) =>
          include.startsWith("packages/") && include.endsWith("/src/**/*"),
      )
      .filter(
        (include: string) =>
          !workspacePackageDirs.has(include.slice(0, -"/src/**/*".length)),
      );

    expect(
      staleIncludes,
      "tsconfig.test.json contains includes for packages that are no longer workspaces",
    ).toEqual([]);
  });

  it("has no root-level module paths (no franken-*/src or frankenfirewall/src)", () => {
    const raw = readFileSync(join(ROOT, "tsconfig.test.json"), "utf8");
    // Should not match bare module paths like "franken-brain/src"
    // but should match "packages/franken-brain/src"
    expect(raw).not.toMatch(/"franken-[^"]*\/src/);
    expect(raw).not.toMatch(/"frankenfirewall\/src/);
  });
});
