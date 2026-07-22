import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const publishedPorts = ["8000", "3000", "3200", "4317", "4318"] as const;

function readRepoFile(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("docker compose published-port security", () => {
  it("binds every default development port to IPv4 localhost", () => {
    const compose = readRepoFile("docker-compose.yml");

    for (const port of publishedPorts) {
      expect(compose).toMatch(
        new RegExp(`^\\s+- ["']127\\.0\\.0\\.1:${port}:${port}["']`, "mu"),
      );
      expect(compose).not.toMatch(
        new RegExp(`^\\s+- ["']?${port}:${port}["']?`, "mu"),
      );
    }
  });

  it("requires the explicit remote override to publish on all interfaces", () => {
    const override = readRepoFile("docker-compose.remote.yml");

    expect(override.match(/ports:\s*!override/gu)).toHaveLength(3);
    for (const port of publishedPorts) {
      expect(override).toMatch(
        new RegExp(`^\\s+- ["']0\\.0\\.0\\.0:${port}:${port}["']`, "mu"),
      );
    }
  });

  it("documents the remote-exposure security tradeoff and opt-in command", () => {
    const quickstart = readRepoFile("docs/guides/quickstart.md");

    expect(quickstart).toContain("docker-compose.remote.yml");
    expect(quickstart).toContain("reachable from other machines");
    expect(quickstart).toContain(
      "docker compose -f docker-compose.yml -f docker-compose.remote.yml up -d",
    );
  });
});
