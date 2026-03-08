import { describe, it, expect, vi } from "vitest";
import { DiscoveryService } from "./discovery-service.js";
import { SkillRegistryError } from "../types/index.js";
import type { ISkillCli } from "./i-skill-cli.js";
import type { RawSkillEntry } from "../types/index.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): RawSkillEntry[] {
  return JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf-8")) as RawSkillEntry[];
}

function makeCli(entries: RawSkillEntry[]): ISkillCli {
  return { list: vi.fn().mockResolvedValue(entries) };
}

describe("DiscoveryService", () => {
  it("maps valid RawSkillEntry to UnifiedSkillContract with all required fields", async () => {
    const cli = makeCli(loadFixture("valid-list-output.json"));
    const service = new DiscoveryService(cli);
    const contracts = await service.discover();
    expect(contracts).toHaveLength(2);
    const first = contracts[0];
    expect(first?.skill_id).toBe("deploy-to-vercel");
    expect(first?.metadata.source).toBe("GLOBAL");
    expect(first?.constraints.is_destructive).toBe(false);
    expect(first?.constraints.requires_hitl).toBe(true);
  });

  it("skips invalid entries and logs a structured error — valid entries still returned", async () => {
    const cli = makeCli(loadFixture("invalid-entry-list-output.json"));
    const service = new DiscoveryService(cli);
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const contracts = await service.discover();
    // Only the valid entry is returned
    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.skill_id).toBe("good-skill");
    // Error was logged for the invalid entry
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("returns empty array when CLI returns empty list — no crash, no error", async () => {
    const cli = makeCli([]);
    const service = new DiscoveryService(cli);
    const contracts = await service.discover();
    expect(contracts).toHaveLength(0);
  });

  it("logs and skips duplicate skill_ids — first entry kept", async () => {
    const duplicate: RawSkillEntry[] = [
      {
        skill_id: "run-tests",
        metadata: { name: "Run Tests", description: "First", source: "GLOBAL" },
        interface: { input_schema: {}, output_schema: {} },
        constraints: { is_destructive: false, requires_hitl: false, sandbox_type: "LOCAL" },
      },
      {
        skill_id: "run-tests",
        metadata: { name: "Run Tests Dupe", description: "Second", source: "GLOBAL" },
        interface: { input_schema: {}, output_schema: {} },
        constraints: { is_destructive: false, requires_hitl: false, sandbox_type: "LOCAL" },
      },
    ];
    const cli = makeCli(duplicate);
    const service = new DiscoveryService(cli);
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const contracts = await service.discover();
    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.metadata.description).toBe("First");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("run-tests"),
      expect.anything(),
    );
    logSpy.mockRestore();
  });

  it("propagates SkillRegistryError from CLI (does not swallow)", async () => {
    const cli: ISkillCli = {
      list: vi.fn().mockRejectedValue(new SkillRegistryError("CLI_FAILURE", "npx failed")),
    };
    const service = new DiscoveryService(cli);
    await expect(service.discover()).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillRegistryError && e.code === "CLI_FAILURE",
    );
  });
});
