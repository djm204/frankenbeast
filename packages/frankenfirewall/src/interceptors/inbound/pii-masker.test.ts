import { describe, it, expect } from "vitest";
import { maskPii } from "./pii-masker.js";
import type { UnifiedRequest } from "../../types/index.js";

function makeRequest(content: string, system?: string): UnifiedRequest {
  return {
    id: "req-pii",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    system,
    messages: [{ role: "user", content }],
  };
}

describe("PiiMasker", () => {
  it("PASS — request with no PII passes through unchanged", () => {
    const req = makeRequest("What is the capital of France?");
    const result = maskPii(req, true);
    expect(result.passed).toBe(true);
    if (result.passed && result.value) {
      expect(result.value.messages[0]?.content).toBe("What is the capital of France?");
    }
  });

  it("MASK — email address replaced with [EMAIL]", () => {
    const result = maskPii(makeRequest("Contact us at user@example.com for help."), true);
    expect(result.passed).toBe(true);
    if (result.passed && result.value) {
      expect(result.value.messages[0]?.content).toContain("[EMAIL]");
      expect(result.value.messages[0]?.content).not.toContain("user@example.com");
    }
  });

  it("MASK — phone number replaced with [PHONE]", () => {
    const result = maskPii(makeRequest("Call me at 555-867-5309."), true);
    expect(result.passed).toBe(true);
    if (result.passed && result.value) {
      expect(result.value.messages[0]?.content).toContain("[PHONE]");
    }
  });

  it("MASK — SSN pattern replaced with [SSN]", () => {
    const result = maskPii(makeRequest("My SSN is 123-45-6789."), true);
    expect(result.passed).toBe(true);
    if (result.passed && result.value) {
      expect(result.value.messages[0]?.content).toContain("[SSN]");
      expect(result.value.messages[0]?.content).not.toContain("123-45-6789");
    }
  });

  it("MASK — PII in system prompt is masked", () => {
    const result = maskPii(makeRequest("Hello", "Admin email: admin@corp.io"), true);
    expect(result.passed).toBe(true);
    if (result.passed && result.value) {
      expect(result.value.system).toContain("[EMAIL]");
    }
  });

  it("MASK — PII in nested tool result content block", () => {
    const result = maskPii(
      {
        id: "r", provider: "anthropic", model: "m",
        messages: [{
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: "tu_01",
            content: "User email is secret@test.com",
          }],
        }],
      },
      true,
    );
    expect(result.passed).toBe(true);
    if (result.passed && result.value) {
      const msg = result.value.messages[0];
      if (msg && Array.isArray(msg.content)) {
        expect(msg.content[0]?.content).toContain("[EMAIL]");
        expect(msg.content[0]?.content).not.toContain("secret@test.com");
      }
    }
  });

  it("NO-OP — redact_pii=false leaves content untouched", () => {
    const req = makeRequest("My email is user@example.com");
    const result = maskPii(req, false);
    expect(result.passed).toBe(true);
    if (result.passed && result.value) {
      expect(result.value.messages[0]?.content).toContain("user@example.com");
    }
  });
});
