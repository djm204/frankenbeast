import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadConfig, ConfigError } from "./load-config.js";

const TMP = join(tmpdir(), "@franken/firewall-config-tests");

const VALID_CONFIG = {
  project_name: "Project-Alpha",
  security_tier: "STRICT",
  schema_version: 1,
  agnostic_settings: {
    redact_pii: true,
    max_token_spend_per_call: 0.05,
    allowed_providers: ["anthropic", "openai"],
  },
  safety_hooks: {
    pre_flight: ["check_injection"],
    post_flight: ["verify_json_schema"],
  },
};

function writeTmp(name: string, content: unknown): string {
  const path = join(TMP, name);
  writeFileSync(path, JSON.stringify(content), "utf-8");
  return path;
}

beforeAll(() => mkdirSync(TMP, { recursive: true }));
afterAll(() => {
  try {
    const { readdirSync } = require("fs") as typeof import("fs");
    for (const f of readdirSync(TMP)) unlinkSync(join(TMP, f));
  } catch {
    // best-effort cleanup
  }
});

describe("loadConfig", () => {
  it("returns a typed, frozen config for a valid file", () => {
    const path = writeTmp("valid.json", VALID_CONFIG);
    const config = loadConfig(path);
    expect(config.project_name).toBe("Project-Alpha");
    expect(config.security_tier).toBe("STRICT");
    expect(config.schema_version).toBe(1);
    expect(config.agnostic_settings.redact_pii).toBe(true);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("throws ConfigError for a missing file", () => {
    expect(() => loadConfig("/nonexistent/path/config.json")).toThrow(ConfigError);
  });

  it("throws ConfigError for malformed JSON", () => {
    const path = join(TMP, "bad.json");
    writeFileSync(path, "{ not valid json", "utf-8");
    expect(() => loadConfig(path)).toThrow(ConfigError);
  });

  it("throws ConfigError for missing project_name", () => {
    const path = writeTmp("no-name.json", { ...VALID_CONFIG, project_name: "" });
    expect(() => loadConfig(path)).toThrow(ConfigError);
  });

  it("throws ConfigError for invalid security_tier", () => {
    const path = writeTmp("bad-tier.json", { ...VALID_CONFIG, security_tier: "ULTRA" });
    expect(() => loadConfig(path)).toThrow(ConfigError);
  });

  it("throws ConfigError for wrong schema_version", () => {
    const path = writeTmp("bad-version.json", { ...VALID_CONFIG, schema_version: 2 });
    expect(() => loadConfig(path)).toThrow(ConfigError);
  });

  it("throws ConfigError for unknown provider in allowed_providers", () => {
    const path = writeTmp("bad-provider.json", {
      ...VALID_CONFIG,
      agnostic_settings: { ...VALID_CONFIG.agnostic_settings, allowed_providers: ["gemini"] },
    });
    expect(() => loadConfig(path)).toThrow(ConfigError);
  });

  it("throws ConfigError for empty allowed_providers", () => {
    const path = writeTmp("empty-providers.json", {
      ...VALID_CONFIG,
      agnostic_settings: { ...VALID_CONFIG.agnostic_settings, allowed_providers: [] },
    });
    expect(() => loadConfig(path)).toThrow(ConfigError);
  });

  it("throws ConfigError for missing safety_hooks", () => {
    const { safety_hooks: _omit, ...rest } = VALID_CONFIG;
    const path = writeTmp("no-hooks.json", rest);
    expect(() => loadConfig(path)).toThrow(ConfigError);
  });
});
