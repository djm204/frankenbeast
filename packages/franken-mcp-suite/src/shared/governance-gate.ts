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
 * - Everything else falls through to the governor with its payload. Destructive
 *   tools whose name the word heuristic misses (e.g. `fbeast_memory_forget`) are
 *   classified in the *shared* governor adapter (`DESTRUCTIVE_ACTIONS`), NOT
 *   here, so the hook path, the public `fbeast_governor_check` tool,
 *   `governor_log`, and this gate all return the same decision for the same
 *   action. Unknown tools are governed by payload — fail-closed by default for
 *   tools we have not vetted.
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
      // Destructive-tool classification (e.g. `forget`) lives in the shared
      // governor adapter, so the decision here matches every other caller.
      const result = await governor.check({ action: tool, context: stringifyArgs(args) });
      return { decision: result.decision, reason: result.reason };
    },
  };
}
