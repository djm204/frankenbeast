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
 * Behavioral classification of fbeast MCP tools for the central gate.
 *
 * The governor's heuristic flags destructive *words* (delete/drop/rm -rf/…).
 * That is correct for shell/CLI actions, but for fbeast tools the dangerous
 * word usually appears in the tool's **data payload** (the text being critiqued,
 * the value being stored, the event being logged), not in the operation itself.
 * Scanning that payload produces false-positive denials that break legitimate
 * read/analyze/store/log workflows on risky content.
 *
 * We therefore classify by what the tool *does*, not what its payload says:
 *
 * - {@link NON_EXECUTING_TOOLS}: the payload is data to query/analyze/store/log;
 *   the tool performs no destructive operation, so it is exempt from
 *   payload-keyword governance and approved.
 * - {@link DESTRUCTIVE_TOOLS}: the tool performs a destructive/irreversible
 *   operation whose name the word heuristic misses (e.g. `forget`); it is
 *   escalated to at-least-`review_recommended`.
 * - Anything else (an unclassified/unknown tool) falls through to the governor
 *   with its payload — fail-closed by default for tools we have not vetted.
 */
const NON_EXECUTING_TOOLS: ReadonlySet<string> = new Set([
  // proxy meta
  'search_tools',
  // safety/meta (their input is the very thing being vetted)
  'fbeast_firewall_scan',
  'fbeast_firewall_scan_file',
  'fbeast_governor_check',
  'fbeast_governor_budget',
  // memory: read + content-agnostic store (storing text is not executing it)
  'fbeast_memory_store',
  'fbeast_memory_query',
  'fbeast_memory_frontload',
  // planner: describing/inspecting a plan is not executing its steps
  'fbeast_plan_decompose',
  'fbeast_plan_status',
  'fbeast_plan_validate',
  // critique: analyzes content; the content under review is the payload
  'fbeast_critique_evaluate',
  'fbeast_critique_compare',
  // observer: read + append-only audit (logging risky content must not block)
  'fbeast_observer_log',
  'fbeast_observer_log_cost',
  'fbeast_observer_cost',
  'fbeast_observer_trail',
  // skills: read-only listing/discovery/loading
  'fbeast_skills_list',
  'fbeast_skills_discover',
  'fbeast_skills_load',
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
      // Exempt non-executing tools: their payload is data to query/analyze/
      // store/log, not an operation to authorize, so payload-keyword governance
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
