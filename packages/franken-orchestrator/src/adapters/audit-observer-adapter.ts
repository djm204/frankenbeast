import type { IObserverModule, SpanHandle, TokenSpendData } from '../deps.js';
import type { AuditTrail } from '@franken/observer';
import { createAuditEvent } from '@franken/observer';
import type { ReplayContentStoreLike, ReplayRecord, ReplayRecordKind } from '../replay/replay-content-store.js';

export interface ReplayCaptureRecord {
  readonly kind: ReplayRecordKind;
  readonly runId: string;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly toolName?: string | undefined;
  readonly content: string;
}

/**
 * Wraps the existing IObserverModule and additionally records
 * audit events to the AuditTrail (Phase 7).
 */
export class AuditTrailObserverAdapter implements IObserverModule {
  constructor(
    private readonly inner: IObserverModule,
    private readonly auditTrail: AuditTrail,
    private currentPhase = 'unknown',
    private currentProvider = 'unknown',
    private readonly replayStore?: ReplayContentStoreLike | undefined,
    private readonly replayManifest: ReplayRecord[] = [],
  ) {}

  setPhase(phase: string): void {
    this.currentPhase = phase;
  }

  setProvider(provider: string): void {
    this.currentProvider = provider;
  }

  startTrace(sessionId: string): void {
    this.inner.startTrace(sessionId);
    this.auditTrail.append(
      createAuditEvent('trace.start', { sessionId }, {
        phase: this.currentPhase,
        provider: this.currentProvider,
      }),
    );
  }

  startSpan(name: string): SpanHandle {
    const innerSpan = this.inner.startSpan(name);
    const auditEvent = createAuditEvent('span.start', { name }, {
      phase: this.currentPhase,
      provider: this.currentProvider,
    });
    this.auditTrail.append(auditEvent);

    return {
      end: (metadata?: Record<string, unknown>) => {
        innerSpan.end(metadata);
        this.auditTrail.append(
          createAuditEvent('span.end', { name, metadata }, {
            phase: this.currentPhase,
            provider: this.currentProvider,
            parentEventId: auditEvent.eventId,
          }),
        );
      },
    };
  }

  async getTokenSpend(sessionId: string): Promise<TokenSpendData> {
    return this.inner.getTokenSpend(sessionId);
  }

  getAuditTrail(): AuditTrail {
    return this.auditTrail;
  }

  recordReplay(record: ReplayCaptureRecord): void {
    if (!this.replayStore) {
      return;
    }
    const contentRef = this.replayStore.put(record.content);
    this.replayManifest.push({
      version: 1,
      kind: record.kind,
      runId: record.runId,
      timestamp: new Date().toISOString(),
      ...(record.provider ? { provider: record.provider } : {}),
      ...(record.model ? { model: record.model } : {}),
      ...(record.toolName ? { toolName: record.toolName } : {}),
      contentRef,
    });
  }

  getReplayManifest(): readonly ReplayRecord[] {
    return [...this.replayManifest];
  }
}
