import { createGovernorAdapter, NON_EXECUTING_TOOLS, type GovernorAdapter } from '../adapters/governor-adapter.js';
import type { GovernanceGate } from './server-factory.js';

function stringifyArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}

const MEMORY_SELECTOR_KEYS = new Set(['key', 'category', 'sourceScope', 'query']);
const MEMORY_POLICY_EVIDENCE_KEYS = ['key', 'category', 'sourceScope', 'query', 'dryRun', 'profile', 'activeProfile', 'crossProfile'] as const;

function stringifyArgsForGovernanceLog(tool: string, args: Record<string, unknown>): string {
  if (!['fbeast_memory_store', 'fbeast_memory_forget', 'fbeast_memory_right_to_forget'].includes(tool)) {
    return stringifyArgs(args);
  }
  const evidence: Record<string, unknown> = {};
  for (const key of MEMORY_POLICY_EVIDENCE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(args, key)) continue;
    evidence[key] = MEMORY_SELECTOR_KEYS.has(key)
      ? '[right-to-forget-selector-redacted]'
      : args[key];
  }
  return stringifyArgs(evidence);
}

/**
 * Builds the default central governance gate used by the MCP server dispatch
 * path. It reuses the same {@link GovernorAdapter} the client hook path uses
 * (`fbeast-hook pre-tool`), so server-side enforcement and hook-based
 * enforcement apply identical policy. Keep this boundary aligned with
 * docs/agent-tool-execution-threat-model.md.
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
      // Exempt non-executing tools: their payload is data to query/analyze/log,
      // not an operation to authorize, so payload-keyword governance
      // would only produce false-positive denials on legitimate risky content.
      if (NON_EXECUTING_TOOLS.has(tool)) {
        return {
          decision: 'approved',
          reason: `Tool "${tool}" is non-executing (its payload is data, not an operation); exempt from payload governance.`,
        };
      }
      if (!governor) {
        governor = createGovernorAdapter(dbPath!);
      }
      // Destructive-tool classification (e.g. `forget`) lives in the shared
      // governor adapter, so the decision here matches every other caller.
      const result = await governor.check({ action: tool, context: stringifyArgsForGovernanceLog(tool, args) });
      return { decision: result.decision, reason: result.reason };
    },
  };
}
