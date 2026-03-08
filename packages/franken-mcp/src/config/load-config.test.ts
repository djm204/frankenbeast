import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./load-config.js";
import { McpRegistryError } from "../types/mcp-registry-error.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = (name: string) => join(__dirname, "fixtures", name);

describe("loadConfig", () => {
  it("returns parsed McpConfig with correct types for valid config", async () => {
    const config = await loadConfig(fixture("valid-config.json"));

    expect(config.servers).toBeDefined();
    expect(Object.keys(config.servers)).toHaveLength(2);

    const echo = config.servers["echo-server"];
    expect(echo).toBeDefined();
    expect(echo!.command).toBe("node");
    expect(echo!.args).toEqual(["echo-server.js"]);
    expect(echo!.constraints).toEqual({
      is_destructive: false,
      requires_hitl: false,
      sandbox_type: "LOCAL",
    });

    const fileServer = config.servers["file-server"];
    expect(fileServer).toBeDefined();
    expect(fileServer!.command).toBe("npx");
    expect(fileServer!.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem"]);
    expect(fileServer!.env).toEqual({ HOME: "/tmp" });
    expect(fileServer!.initTimeoutMs).toBe(10000);
    expect(fileServer!.callTimeoutMs).toBe(5000);
    expect(fileServer!.toolOverrides).toBeDefined();
    expect(fileServer!.toolOverrides!["write_file"]).toBeDefined();
    expect(fileServer!.toolOverrides!["write_file"]!.constraints).toEqual({
      is_destructive: true,
      requires_hitl: true,
    });
  });

  it("throws McpRegistryError with CONFIG_NOT_FOUND for missing file", async () => {
    await expect(loadConfig(fixture("nonexistent.json"))).rejects.toThrow(McpRegistryError);
    await expect(loadConfig(fixture("nonexistent.json"))).rejects.toMatchObject({
      code: "CONFIG_NOT_FOUND",
    });
  });

  it("throws McpRegistryError with CONFIG_INVALID for malformed JSON", async () => {
    await expect(loadConfig(fixture("malformed.json"))).rejects.toThrow(McpRegistryError);
    await expect(loadConfig(fixture("malformed.json"))).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });

  it("throws McpRegistryError with CONFIG_INVALID when command field is missing", async () => {
    await expect(loadConfig(fixture("invalid-config.json"))).rejects.toThrow(McpRegistryError);

    try {
      await loadConfig(fixture("invalid-config.json"));
    } catch (err) {
      expect(err).toBeInstanceOf(McpRegistryError);
      const mcpErr = err as McpRegistryError;
      expect(mcpErr.code).toBe("CONFIG_INVALID");
      expect(mcpErr.message).toContain("command");
    }
  });

  it("throws McpRegistryError with CONFIG_INVALID when servers key is missing", async () => {
    // Create an inline temp approach: write to a known path
    const { writeFile, unlink } = await import("node:fs/promises");
    const tempPath = join(__dirname, "fixtures", "_temp-no-servers.json");
    await writeFile(tempPath, JSON.stringify({ notServers: {} }));

    try {
      await expect(loadConfig(tempPath)).rejects.toThrow(McpRegistryError);
      await expect(loadConfig(tempPath)).rejects.toMatchObject({
        code: "CONFIG_INVALID",
      });
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  });

  it("returns valid config with 0 servers for empty servers object", async () => {
    const config = await loadConfig(fixture("empty-servers.json"));
    expect(config.servers).toEqual({});
    expect(Object.keys(config.servers)).toHaveLength(0);
  });

  it("strips unknown fields via Zod", async () => {
    const { writeFile, unlink } = await import("node:fs/promises");
    const tempPath = join(__dirname, "fixtures", "_temp-extra-fields.json");
    await writeFile(
      tempPath,
      JSON.stringify({
        servers: {
          "test-server": {
            command: "echo",
            args: [],
            unknownField: "should be stripped",
          },
        },
        topLevelUnknown: true,
      }),
    );

    try {
      const config = await loadConfig(tempPath);
      expect(config.servers["test-server"]).toBeDefined();
      expect(config.servers["test-server"]!.command).toBe("echo");
      // Unknown fields should not appear on the parsed result
      expect("unknownField" in config.servers["test-server"]!).toBe(false);
      expect("topLevelUnknown" in config).toBe(false);
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  });

  it("returns only provided constraint fields for partial constraints", async () => {
    const { writeFile, unlink } = await import("node:fs/promises");
    const tempPath = join(__dirname, "fixtures", "_temp-partial-constraints.json");
    await writeFile(
      tempPath,
      JSON.stringify({
        servers: {
          "partial-server": {
            command: "node",
            constraints: {
              is_destructive: false,
            },
          },
        },
      }),
    );

    try {
      const config = await loadConfig(tempPath);
      const server = config.servers["partial-server"];
      expect(server).toBeDefined();
      expect(server!.constraints).toBeDefined();
      expect(server!.constraints!.is_destructive).toBe(false);
      // Other constraint fields should be undefined since they weren't provided
      expect(server!.constraints!.requires_hitl).toBeUndefined();
      expect(server!.constraints!.sandbox_type).toBeUndefined();
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  });
});
