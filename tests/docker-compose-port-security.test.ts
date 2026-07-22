import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const publishedPorts = ["8000", "3000", "3200", "4317", "4318"] as const;

function readRepoFile(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("docker compose published-port security", () => {
  it("disables anonymous Grafana access by default with an explicit local opt-in", () => {
    const compose = readRepoFile("docker-compose.yml");
    const envExample = readRepoFile(".env.example");
    const quickstart = readRepoFile("docs/guides/quickstart.md");

    expect(compose).toContain(
      "GF_AUTH_ANONYMOUS_ENABLED=${GRAFANA_ANONYMOUS_ENABLED:-false}",
    );
    expect(compose).not.toMatch(/GF_AUTH_ANONYMOUS_ENABLED=true/u);
    expect(envExample).toContain("GRAFANA_ANONYMOUS_ENABLED=true");
    expect(quickstart).toContain(
      "GRAFANA_ANONYMOUS_ENABLED=true docker compose up -d grafana",
    );
    expect(quickstart).toContain("remains bound to `127.0.0.1`");
    expect(quickstart).toContain("Do not combine this opt-in");
  });

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
    expect(override).toMatch(/GF_AUTH_ANONYMOUS_ENABLED:\s*["']false["']/u);
  });

  it("documents the remote-exposure security tradeoff and opt-in command", () => {
    const quickstart = readRepoFile("docs/guides/quickstart.md");

    expect(quickstart).toContain("docker-compose.remote.yml");
    expect(quickstart).toContain("reachable from other machines");
    expect(quickstart).toMatch(/Docker Engine 28\.0\.0 or\s+newer/u);
    expect(quickstart).toContain("same layer-2 network");
    expect(quickstart).toContain(
      "docker compose -f docker-compose.yml -f docker-compose.remote.yml up -d",
    );
  });
});
