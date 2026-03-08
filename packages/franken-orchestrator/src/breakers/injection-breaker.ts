import type { FirewallResult } from '../deps.js';

/**
 * Injection breaker: checks every firewall pipeline result.
 * If blocked, signals immediate halt.
 */
export function checkInjection(result: FirewallResult): { halt: boolean; reason?: string } {
  if (result.blocked) {
    return {
      halt: true,
      reason: `Injection detected: ${result.violations.map(v => v.detail).join(', ')}`,
    };
  }
  return { halt: false };
}
