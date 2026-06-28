import { randomUUID } from 'node:crypto';
import { createObserverAdapter, type ObserverAdapter } from '../adapters/observer-adapter.js';
import { createGovernanceGate } from './governance-gate.js';
import type { AuditSink, CreateMcpServerOptions } from './server-factory.js';

function resolveSessionId(): string {
  return (
    process.env['FBEAST_SESSION_ID']
    ?? process.env['CLAUDE_SESSION_ID']
    ?? randomUUID()
  );
}

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

  return {
    async record({ tool, ok }) {
      if (!observer) {
        observer = createObserverAdapter(dbPath!);
      }
      await observer.log({
        event: 'tool_call',
        metadata: JSON.stringify({ tool, ok, source: 'central-dispatch' }),
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
