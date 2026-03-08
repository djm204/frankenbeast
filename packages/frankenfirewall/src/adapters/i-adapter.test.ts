import { describe, it, expectTypeOf } from "vitest";
import type { IAdapter, CapabilityFeature } from "./i-adapter.js";
import type { UnifiedRequest } from "../types/index.js";
import type { UnifiedResponse } from "../types/index.js";

describe("IAdapter interface contract", () => {
  it("transformRequest accepts UnifiedRequest and returns unknown provider shape", () => {
    expectTypeOf<IAdapter["transformRequest"]>().toBeFunction();
    expectTypeOf<IAdapter["transformRequest"]>().parameter(0).toEqualTypeOf<UnifiedRequest>();
    expectTypeOf<IAdapter["transformRequest"]>().returns.toBeUnknown();
  });

  it("execute accepts unknown and returns Promise<unknown>", () => {
    expectTypeOf<IAdapter["execute"]>().toBeFunction();
    expectTypeOf<IAdapter["execute"]>().parameter(0).toBeUnknown();
    expectTypeOf<IAdapter["execute"]>().returns.toEqualTypeOf<Promise<unknown>>();
  });

  it("transformResponse returns UnifiedResponse", () => {
    expectTypeOf<IAdapter["transformResponse"]>().returns.toEqualTypeOf<UnifiedResponse>();
  });

  it("validateCapabilities accepts CapabilityFeature and returns boolean", () => {
    expectTypeOf<IAdapter["validateCapabilities"]>().parameter(0).toEqualTypeOf<CapabilityFeature>();
    expectTypeOf<IAdapter["validateCapabilities"]>().returns.toBeBoolean();
  });
});
