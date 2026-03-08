import { describe, it, expectTypeOf } from "vitest";
describe("UnifiedRequest type shape", () => {
    it("requires id, provider, model, and messages", () => {
        expectTypeOf().toHaveProperty("id").toBeString();
        expectTypeOf().toHaveProperty("provider").toBeString();
        expectTypeOf().toHaveProperty("model").toBeString();
        expectTypeOf().toHaveProperty("messages");
    });
    it("system is optional", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("tools is optional array of ToolDefinition", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("message role is constrained to union", () => {
        expectTypeOf().toEqualTypeOf();
    });
});
//# sourceMappingURL=unified-request.test.js.map