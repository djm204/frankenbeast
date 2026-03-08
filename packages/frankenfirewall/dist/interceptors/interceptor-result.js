export function pass(value) {
    if (value !== undefined) {
        return { passed: true, value };
    }
    return { passed: true };
}
export function block(violations) {
    return { passed: false, violations };
}
export function blockOne(violation) {
    return { passed: false, violations: [violation] };
}
//# sourceMappingURL=interceptor-result.js.map