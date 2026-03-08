import { describe, it, expectTypeOf } from "vitest";
describe("UnifiedResponse type shape", () => {
    it("schema_version is literal 1", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("content is string or null", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("tool_calls is an array of ToolCall", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("finish_reason is constrained to valid enum values", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("usage contains input_tokens, output_tokens, cost_usd", () => {
        expectTypeOf().toHaveProperty("input_tokens").toBeNumber();
        expectTypeOf().toHaveProperty("output_tokens").toBeNumber();
        expectTypeOf().toHaveProperty("cost_usd").toBeNumber();
    });
});
//# sourceMappingURL=unified-response.test.js.map