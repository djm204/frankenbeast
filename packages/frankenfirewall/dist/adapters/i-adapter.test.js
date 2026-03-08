import { describe, it, expectTypeOf } from "vitest";
describe("IAdapter interface contract", () => {
    it("transformRequest accepts UnifiedRequest and returns unknown provider shape", () => {
        expectTypeOf().toBeFunction();
        expectTypeOf().parameter(0).toEqualTypeOf();
        expectTypeOf().returns.toBeUnknown();
    });
    it("execute accepts unknown and returns Promise<unknown>", () => {
        expectTypeOf().toBeFunction();
        expectTypeOf().parameter(0).toBeUnknown();
        expectTypeOf().returns.toEqualTypeOf();
    });
    it("transformResponse returns UnifiedResponse", () => {
        expectTypeOf().returns.toEqualTypeOf();
    });
    it("validateCapabilities accepts CapabilityFeature and returns boolean", () => {
        expectTypeOf().parameter(0).toEqualTypeOf();
        expectTypeOf().returns.toBeBoolean();
    });
});
//# sourceMappingURL=i-adapter.test.js.map