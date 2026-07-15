import { createGovernorAdapter, NON_EXECUTING_TOOLS, type GovernorAdapter } from '../adapters/governor-adapter.js';
import type { GovernanceGate } from './server-factory.js';
import { evaluateHighRiskActionPolicy, type HighRiskActionClass, type HighRiskActionEvidence } from '@franken/governor';

type GateDecision = Awaited<ReturnType<GovernanceGate['check']>>;

const HIGH_RISK_TOOL_ACTIONS: Readonly<Record<string, HighRiskActionClass>> = {
  fbeast_memory_store: 'memory',
  fbeast_memory_forget: 'memory',
  fbeast_memory_right_to_forget: 'memory',
};

function stringifyArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}

const RIGHT_TO_FORGET_SELECTOR_KEYS = new Set(['key', 'category', 'sourceScope', 'query']);

function stringifyArgsForGovernanceLog(tool: string, args: Record<string, unknown>): string {
  if (tool !== 'fbeast_memory_right_to_forget') return stringifyArgs(args);
  const redacted: Record<string, unknown> = { ...args };
  for (const key of RIGHT_TO_FORGET_SELECTOR_KEYS) {
    if (Object.prototype.hasOwnProperty.call(redacted, key)) {
      redacted[key] = '[right-to-forget-selector-redacted]';
    }
  }
  return stringifyArgs(redacted);
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function booleanArg(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return undefined;
}

function selectorTarget(args: Record<string, unknown>): string | undefined {
  const selectors = ['key', 'category', 'sourceScope', 'query']
    .map((key) => stringArg(args, key))
    .filter((value): value is string => value !== undefined);
  return selectors.length > 0 ? selectors.join(',') : undefined;
}

function evidenceForHighRiskTool(tool: string, args: Record<string, unknown>): HighRiskActionEvidence | undefined {
  switch (tool) {
    case 'fbeast_memory_store': {
      const target = stringArg(args, 'key');
      return { operation: 'store', ...(target !== undefined ? { target } : {}) };
    }
    case 'fbeast_memory_forget': {
      const target = stringArg(args, 'key');
      return { operation: 'delete', ...(target !== undefined ? { target } : {}) };
    }
    case 'fbeast_memory_right_to_forget': {
      const target = selectorTarget(args);
      const dryRun = booleanArg(args, 'dryRun');
      return {
        operation: 'right-to-forget',
        ...(target !== undefined ? { target } : {}),
        ...(dryRun !== undefined ? { dryRun } : {}),
      };
    }
    default:
      return undefined;
  }
}

function mapPolicyDecision(tool: string, actionClass: HighRiskActionClass, evidence: HighRiskActionEvidence): GateDecision {
  const result = evaluateHighRiskActionPolicy({ actionClass, evidence });
  if (result.decision === 'allow') {
    return { decision: 'approved', reason: `High-risk policy allowed ${tool}: ${result.reason}` };
  }
  if (result.decision === 'deny') {
    return { decision: 'denied', reason: `High-risk policy denied ${tool}: ${result.reason}` };
  }
  return { decision: 'review_recommended', reason: `High-risk policy requires approval for ${tool}: ${result.reason}` };
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
      // Exempt non-executing tools: their payload is data to query/analyze/
      // store/log, not an operation to authorize, so payload-keyword governance
      // would only produce false-positive denials on legitimate risky content.
      if (NON_EXECUTING_TOOLS.has(tool)) {
        return {
          decision: 'approved',
          reason: `Tool "${tool}" is non-executing (its payload is data, not an operation); exempt from payload governance.`,
        };
      }
      const highRiskActionClass = HIGH_RISK_TOOL_ACTIONS[tool];
      if (highRiskActionClass !== undefined) {
        return mapPolicyDecision(tool, highRiskActionClass, evidenceForHighRiskTool(tool, args) ?? {});
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
