import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentSkillsCli } from "./agent-skills-cli.js";
import { SkillRegistryError } from "../types/index.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const validFixture = readFileSync(
  join(__dirname, "fixtures", "valid-list-output.json"),
  "utf-8",
);

// Mock child_process so no real npx is ever spawned in tests
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
const mockExecFile = vi.mocked(execFile);

function makeExecFileImpl(stdout: string, exitCode = 0): typeof execFile {
  const impl = (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown): ReturnType<typeof execFile> => {
    const cb = callback as (err: Error | null, stdout: string, stderr: string) => void;
    if (exitCode !== 0) {
      const err = new Error("Command failed") as NodeJS.ErrnoException;
      (err as unknown as Record<string, unknown>)["code"] = exitCode;
      cb(err, "", "non-zero exit");
    } else {
      cb(null, stdout, "");
    }
    return {} as ReturnType<typeof execFile>;
  };
  return impl as unknown as typeof execFile;
}

describe("AgentSkillsCli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list() returns parsed RawSkillEntry[] from fixture stdout", async () => {
    mockExecFile.mockImplementation(makeExecFileImpl(validFixture));
    const cli = new AgentSkillsCli();
    const entries = await cli.list();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.skill_id).toBe("deploy-to-vercel");
    expect(entries[1]?.skill_id).toBe("run-tests");
  });

  it("throws SkillRegistryError(CLI_FAILURE) on non-zero exit code", async () => {
    mockExecFile.mockImplementation(makeExecFileImpl("", 1));
    const cli = new AgentSkillsCli();
    await expect(cli.list()).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillRegistryError && e.code === "CLI_FAILURE",
    );
  });

  it("throws SkillRegistryError(PARSE_ERROR) on malformed JSON stdout", async () => {
    mockExecFile.mockImplementation(makeExecFileImpl("not json at all {{"));
    const cli = new AgentSkillsCli();
    await expect(cli.list()).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillRegistryError && e.code === "PARSE_ERROR",
    );
  });

  it("throws SkillRegistryError(CLI_TIMEOUT) on subprocess timeout", async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (err: Error | null, stdout: string, stderr: string) => void;
      const err = new Error("Command timed out") as NodeJS.ErrnoException;
      (err as unknown as Record<string, unknown>)["killed"] = true;
      cb(err, "", "");
      return {} as ReturnType<typeof execFile>;
    });
    const cli = new AgentSkillsCli();
    await expect(cli.list()).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillRegistryError && e.code === "CLI_TIMEOUT",
    );
  });
});
