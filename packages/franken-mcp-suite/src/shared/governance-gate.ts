import { createGovernorAdapter, type GovernorAdapter } from '../adapters/governor-adapter.js';
import type { GovernanceGate } from './server-factory.js';

function stringifyArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}

/**
 * Builds the default central governance gate used by the MCP server dispatch
 * path. It reuses the same {@link GovernorAdapter} the client hook path uses
 * (`fbeast-hook pre-tool`), so server-side enforcement and hook-based
 * enforcement apply identical policy.
 *
 * Pass a `dbPath` (the adapter is created lazily on first check, preserving the
 * lazy-DB semantics of the proxy server) or an existing `GovernorAdapter` to
 * reuse one already constructed by the caller.
 */
export function createGovernanceGate(source: string | GovernorAdapter): GovernanceGate {
  let governor: GovernorAdapter | undefined = typeof source === 'string' ? undefined : source;
  const dbPath = typeof source === 'string' ? source : undefined;

  return {
    async check({ tool, args }) {
      if (!governor) {
        governor = createGovernorAdapter(dbPath!);
      }
      const result = await governor.check({ action: tool, context: stringifyArgs(args) });
      return { decision: result.decision, reason: result.reason };
    },
  };
}
