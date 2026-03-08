/**
 * Injection breaker: checks every firewall pipeline result.
 * If blocked, signals immediate halt.
 */
export function checkInjection(result) {
    if (result.blocked) {
        return {
            halt: true,
            reason: `Injection detected: ${result.violations.map(v => v.detail).join(', ')}`,
        };
    }
    return { halt: false };
}
//# sourceMappingURL=injection-breaker.js.map