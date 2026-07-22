import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OrchestratorConfigSchema } from "../packages/franken-orchestrator/src/config/orchestrator-config.js";

const ROOT = resolve(import.meta.dirname, "..");

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readText(relativePath)) as Record<string, unknown>;
}

const examples = [
  "quick-start",
  "cli-plan",
  "mcp-suite",
  "orchestrator-config",
] as const;

describe("issue #3480 runnable example projects", () => {
  it("exposes the examples from the root README and quickstart guide", () => {
    expect(readText("README.md")).toContain("[examples](examples/README.md)");
    expect(readText("docs/guides/quickstart.md")).toContain(
      "[sample projects](../../examples/README.md)",
    );
    expect(readText("docs/ARCHITECTURE.md")).toContain(
      "[`examples/`](../examples/README.md)",
    );
  });

  it("keeps every listed example self-contained and scaffoldable", () => {
    const index = readText("examples/README.md");

    for (const example of examples) {
      expect(index).toContain(`(${example}/README.md)`);
      expect(existsSync(resolve(ROOT, `examples/${example}/README.md`))).toBe(
        true,
      );
      expect(
        existsSync(resolve(ROOT, `examples/${example}/package.json`)),
      ).toBe(true);
      expect(
        existsSync(resolve(ROOT, `examples/${example}/package-lock.json`)),
      ).toBe(true);
      expect(readJson(`examples/${example}/package.json`).private).toBe(true);
    }
  });

  it("provides a CLI plan design doc and exact plan command", () => {
    const readme = readText("examples/cli-plan/README.md");

    expect(readme).toContain(
      "frankenbeast plan --design-doc docs/sample-design.md",
    );
    expect(
      existsSync(resolve(ROOT, "examples/cli-plan/docs/sample-design.md")),
    ).toBe(true);
  });

  it("provides project-scoped MCP setup commands", () => {
    const readme = readText("examples/mcp-suite/README.md");

    expect(readme).toContain("fbeast mcp init");
    expect(readme).toContain("fbeast mcp init --mode=proxy");
    expect(readme).toContain("fbeast mcp uninstall");
  });

  it("provides a valid minimal orchestrator config", () => {
    const config = readJson("examples/orchestrator-config/.fbeast/config.json");

    expect(config).toEqual({
      maxCritiqueIterations: 2,
      maxTotalTokens: 20000,
      maxDurationMs: 120000,
      minCritiqueScore: 0.7,
      enableHeartbeat: false,
      enableTracing: false,
    });
    expect(OrchestratorConfigSchema.safeParse(config).success).toBe(true);

    const readme = readText("examples/orchestrator-config/README.md");
    expect(readme.indexOf("npm run setup")).toBeLessThan(
      readme.indexOf("npm run plan"),
    );
    expect(readme.indexOf("npm run plan")).toBeLessThan(
      readme.indexOf("npm start"),
    );
    expect(
      readJson("examples/orchestrator-config/package.json").scripts,
    ).toMatchObject({ setup: "git init" });
    expect(
      existsSync(
        resolve(ROOT, "examples/orchestrator-config/docs/sample-design.md"),
      ),
    ).toBe(true);
  });

  it("prints package-specific next steps for examples without start scripts", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "frankenbeast-examples-"));
    const target = join(tempRoot, "cli-plan");

    try {
      const result = spawnSync(
        "bash",
        [resolve(ROOT, "scripts/create-project.sh"), "cli-plan", target],
        { cwd: ROOT, encoding: "utf8" },
      );

      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(result.stdout).toContain("See README.md");
      expect(result.stdout).not.toContain("npm start");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
