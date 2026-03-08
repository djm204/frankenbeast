import { readFile } from "node:fs/promises";
import { mcpConfigSchema, type McpConfig } from "./config-schema.js";
import { McpRegistryError } from "../types/mcp-registry-error.js";

export async function loadConfig(configPath: string): Promise<McpConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new McpRegistryError(
        "CONFIG_NOT_FOUND",
        `Config file not found: ${configPath}`,
      );
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new McpRegistryError(
      "CONFIG_INVALID",
      `Invalid JSON in config file: ${configPath}`,
    );
  }

  const result = mcpConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new McpRegistryError(
      "CONFIG_INVALID",
      `Config validation failed: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
    );
  }

  return result.data;
}
