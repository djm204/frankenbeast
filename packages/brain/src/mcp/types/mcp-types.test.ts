import { describe, it, expectTypeOf } from "vitest";
import type { McpToolDefinition } from "./mcp-tool-definition.js";
import type { McpToolResult, McpContent } from "./mcp-tool-result.js";
import type { McpToolConstraints } from "./mcp-tool-constraints.js";
import type { McpServerInfo } from "./mcp-server-info.js";
import { McpRegistryError } from "./mcp-registry-error.js";

describe("McpToolDefinition", () => {
  it("has all required fields with correct types", () => {
    expectTypeOf<McpToolDefinition["name"]>().toBeString();
    expectTypeOf<McpToolDefinition["serverId"]>().toBeString();
    expectTypeOf<McpToolDefinition["description"]>().toBeString();
    expectTypeOf<McpToolDefinition["inputSchema"]>().toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf<McpToolDefinition["constraints"]>().toEqualTypeOf<McpToolConstraints>();
  });
});

describe("McpToolResult", () => {
  it("has content as McpContent array", () => {
    expectTypeOf<McpToolResult["content"]>().toEqualTypeOf<McpContent[]>();
  });

  it("has isError as boolean", () => {
    expectTypeOf<McpToolResult["isError"]>().toBeBoolean();
  });

  it("content is a discriminated union", () => {
    const textContent: McpContent = { type: "text", text: "hello" };
    const imageContent: McpContent = { type: "image", data: "base64", mimeType: "image/png" };
    const linkContent: McpContent = { type: "resource_link", uri: "file:///foo" };

    expectTypeOf(textContent).toMatchTypeOf<McpContent>();
    expectTypeOf(imageContent).toMatchTypeOf<McpContent>();
    expectTypeOf(linkContent).toMatchTypeOf<McpContent>();
  });
});

describe("McpToolConstraints", () => {
  it("sandbox_type is a union of 3 literals", () => {
    expectTypeOf<McpToolConstraints["sandbox_type"]>().toEqualTypeOf<"DOCKER" | "WASM" | "LOCAL">();
  });

  it("has boolean flags", () => {
    expectTypeOf<McpToolConstraints["is_destructive"]>().toBeBoolean();
    expectTypeOf<McpToolConstraints["requires_hitl"]>().toBeBoolean();
  });
});

describe("McpServerInfo", () => {
  it("status is a union of 3 literals", () => {
    expectTypeOf<McpServerInfo["status"]>().toEqualTypeOf<"connected" | "disconnected" | "error">();
  });

  it("serverInfo is optional", () => {
    expectTypeOf<McpServerInfo["serverInfo"]>().toEqualTypeOf<{ name: string; version: string } | undefined>();
  });
});

describe("McpRegistryError", () => {
  it("extends Error", () => {
    expectTypeOf<McpRegistryError>().toMatchTypeOf<Error>();
  });

  it("has code, serverId, and toolName", () => {
    expectTypeOf<McpRegistryError["code"]>().toBeString();
    expectTypeOf<McpRegistryError["serverId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<McpRegistryError["toolName"]>().toEqualTypeOf<string | undefined>();
  });

  it("constructs with correct arguments", () => {
    const err = new McpRegistryError("TOOL_NOT_FOUND", "not found", "server1", "tool1");
    expectTypeOf(err).toMatchTypeOf<McpRegistryError>();
  });
});
