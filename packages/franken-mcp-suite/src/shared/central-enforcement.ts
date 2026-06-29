import { createObserverAdapter, type ObserverAdapter } from '../adapters/observer-adapter.js';
import { createGovernanceGate } from './governance-gate.js';
import type { AuditSink, CreateMcpServerOptions } from './server-factory.js';

/**
 * Stable, well-known session id used for central audit records when neither
 * `FBEAST_SESSION_ID` nor `CLAUDE_SESSION_ID` is set. The default `fbeast init`
 * standard install registers standalone servers without those env vars, so a
 * random UUID fallback would be unretrievable: `fbeast_observer_trail` requires
 * the caller to supply the session id. Using a documented constant means a
 * user can always retrieve the central trail via
 * `fbeast_observer_trail({ sessionId: 'fbeast-central-dispatch' })`, and every
 * standalone server on the same DB writes under the same queryable id.
 *
 * An explicit `FBEAST_SESSION_ID`/`CLAUDE_SESSION_ID` still takes precedence so
 * real per-run correlation works when the host provides it.
 */
export const DEFAULT_AUDIT_SESSION_ID = 'fbeast-central-dispatch';

/**
 * Builds the server-side audit sink used by the central dispatch path. It logs
 * each dispatched tool call through the same {@link ObserverAdapter} the
 * post-tool hook uses, so the central path produces an `audit_trail` record even
 * when no client hooks are installed (see ADR-035).
 *
 * Pass a `dbPath` (observer is created lazily on first record, preserving the
 * proxy's lazy-DB semantics) or an existing `ObserverAdapter` to reuse one.
 */
export function createAuditSink(source: string | ObserverAdapter): AuditSink {
  let observer: ObserverAdapter | undefined = typeof source === 'string' ? undefined : source;
  const dbPath = typeof source === 'string' ? source : undefined;
  // Resolve the session id once per sink (process). Prefer an explicit env id
  // for real per-run correlation; otherwise fall back to a documented constant
  // (not a random UUID) so the records stay retrievable via
  // `fbeast_observer_trail` (see DEFAULT_AUDIT_SESSION_ID).
  let sessionId: string | undefined;
  function resolveSessionId(): string {
    if (!sessionId) {
      sessionId =
        process.env['FBEAST_SESSION_ID']
        ?? process.env['CLAUDE_SESSION_ID']
        ?? DEFAULT_AUDIT_SESSION_ID;
    }
    return sessionId;
  }

  return {
    async record({ tool, ok, decision, args }) {
      if (!observer) {
        observer = createObserverAdapter(dbPath!);
      }
      await observer.log({
        event: 'tool_call',
        metadata: JSON.stringify({
          tool,
          ok,
          source: 'central-dispatch',
          ...(decision !== undefined ? { decision } : {}),
          ...(args !== undefined ? { args } : {}),
        }),
        sessionId: resolveSessionId(),
      });
    },
  };
}

/**
 * Convenience bundle wiring the full central enforcement layer (governance gate
 * + server-side audit) from a single `dbPath`. Used by every runtime MCP server
 * entry point so the default, no-hooks install is governed and audited
 * uniformly — eliminating the divergence between governed aggregate servers and
 * the standalone single-purpose servers `fbeast init` registers by default.
 */
export function createCentralOptions(dbPath: string): CreateMcpServerOptions {
  return {
    governance: createGovernanceGate(dbPath),
    audit: createAuditSink(dbPath),
  };
}
