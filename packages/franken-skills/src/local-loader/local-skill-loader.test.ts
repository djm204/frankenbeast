import { describe, it, expect, vi } from "vitest";
import { LocalSkillLoader } from "./local-skill-loader.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureSkillsDir = join(__dirname, "fixtures", "skills");
const emptyDir = join(__dirname, "fixtures", "empty-skills");
const nonExistentDir = join(__dirname, "fixtures", "does-not-exist");

describe("LocalSkillLoader", () => {
  it("loads valid JSON skill file as UnifiedSkillContract", async () => {
    const loader = new LocalSkillLoader();
    const contracts = await loader.load(fixtureSkillsDir);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.skill_id).toBe("custom-deploy");
    expect(contracts[0]?.metadata.source).toBe("LOCAL");
    expect(contracts[0]?.constraints.is_destructive).toBe(true);
  });

  it("logs error and skips file with missing required field", async () => {
    const loader = new LocalSkillLoader();
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Write a temp bad file during test — we test with a dedicated fixture dir
    const contracts = await loader.load(join(__dirname, "fixtures", "invalid-skills"));
    expect(contracts).toHaveLength(0);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("logs error and skips malformed JSON file", async () => {
    const loader = new LocalSkillLoader();
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const contracts = await loader.load(join(__dirname, "fixtures", "malformed-skills"));
    expect(contracts).toHaveLength(0);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("returns empty array for empty directory — no error", async () => {
    const loader = new LocalSkillLoader();
    const contracts = await loader.load(emptyDir);
    expect(contracts).toHaveLength(0);
  });

  it("returns empty array when directory does not exist — info log, no crash", async () => {
    const loader = new LocalSkillLoader();
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const contracts = await loader.load(nonExistentDir);
    expect(contracts).toHaveLength(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("does not exist"), expect.anything());
    logSpy.mockRestore();
  });

  it("silently ignores non-.json files", async () => {
    const loader = new LocalSkillLoader();
    const contracts = await loader.load(join(__dirname, "fixtures", "mixed-skills"));
    // Only the .json file should be loaded
    expect(contracts.every((c) => typeof c.skill_id === "string")).toBe(true);
  });
});
