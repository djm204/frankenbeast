import { describe, it, expectTypeOf } from "vitest";
describe("GuardrailViolation type shape", () => {
    it("has required code, message, interceptor fields", () => {
        expectTypeOf().toHaveProperty("code");
        expectTypeOf().toHaveProperty("message").toBeString();
        expectTypeOf().toHaveProperty("interceptor");
    });
    it("payload is optional", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("ViolationCode covers all expected codes", () => {
        expectTypeOf().toEqualTypeOf();
    });
    it("InterceptorName covers all pipeline stages", () => {
        expectTypeOf().toEqualTypeOf();
    });
});
//# sourceMappingURL=guardrail-violation.test.js.map