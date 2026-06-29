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
 * Read-only safety/meta tools whose *purpose* is to inspect untrusted or
 * risky-looking input. Routing their payload through the destructive-pattern
 * governor self-blocks them: `fbeast_firewall_scan` on the text "delete all
 * files", or `fbeast_governor_check` with action "delete_file", legitimately
 * carry dangerous words in their arguments. They perform no mutating action of
 * their own, so they are exempt from payload-based governance (the gate would
 * otherwise refuse the very scan/check they exist to perform).
 */
const SAFE_READONLY_TOOLS: ReadonlySet<string> = new Set([
  'fbeast_firewall_scan',
  'fbeast_firewall_scan_file',
  'fbeast_governor_check',
  'search_tools',
]);

/**
 * fbeast tools that perform a destructive/mutating operation but whose tool
 * name does not literally match the governor's destructive-word heuristic
 * (delete/drop/truncate/…). They are classified by their actual risk rather
 * than payload text, so a benign-looking payload (e.g. `fbeast_memory_forget`
 * with key "note") cannot be auto-approved.
 */
const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set([
  'fbeast_memory_forget',
]);

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
      // Exempt read-only safety/meta tools: their input is the thing being
      // vetted, so payload-based governance would deny the scan/check itself.
      if (SAFE_READONLY_TOOLS.has(tool)) {
        return {
          decision: 'approved',
          reason: `Tool "${tool}" is a read-only safety/meta tool; exempt from payload governance.`,
        };
      }
      if (!governor) {
        governor = createGovernorAdapter(dbPath!);
      }
      const result = await governor.check({ action: tool, context: stringifyArgs(args) });
      // Escalate known-destructive fbeast tools the word-pattern heuristic
      // misses (e.g. `forget`) so a benign payload cannot auto-approve a
      // mutating call. Never downgrade a stricter governor decision.
      if (DESTRUCTIVE_TOOLS.has(tool) && result.decision === 'approved') {
        return {
          decision: 'review_recommended',
          reason: `Tool "${tool}" performs a destructive operation and requires review.`,
        };
      }
      return { decision: result.decision, reason: result.reason };
    },
  };
}
