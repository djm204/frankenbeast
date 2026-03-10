import { describe, it, expectTypeOf } from "vitest";
import type { UnifiedRequest, Message, ToolDefinition } from "./unified-request.js";

describe("UnifiedRequest type shape", () => {
  it("requires id, provider, model, and messages", () => {
    expectTypeOf<UnifiedRequest>().toHaveProperty("id").toBeString();
    expectTypeOf<UnifiedRequest>().toHaveProperty("provider").toBeString();
    expectTypeOf<UnifiedRequest>().toHaveProperty("model").toBeString();
    expectTypeOf<UnifiedRequest>().toHaveProperty("messages");
  });

  it("system is optional", () => {
    expectTypeOf<UnifiedRequest["system"]>().toEqualTypeOf<string | undefined>();
  });

  it("tools is optional array of ToolDefinition", () => {
    expectTypeOf<UnifiedRequest["tools"]>().toEqualTypeOf<ToolDefinition[] | undefined>();
  });

  it("message role is constrained to union", () => {
    expectTypeOf<Message["role"]>().toEqualTypeOf<"user" | "assistant" | "tool">();
  });
});
