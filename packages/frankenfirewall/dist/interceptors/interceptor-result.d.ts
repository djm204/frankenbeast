import type { GuardrailViolation } from "../types/index.js";
export type InterceptorResult<T = void> = {
    passed: true;
    value?: T;
} | {
    passed: false;
    violations: GuardrailViolation[];
};
export declare function pass<T>(value?: T): InterceptorResult<T>;
export declare function block(violations: GuardrailViolation[]): InterceptorResult<never>;
export declare function blockOne(violation: GuardrailViolation): InterceptorResult<never>;
//# sourceMappingURL=interceptor-result.d.ts.map