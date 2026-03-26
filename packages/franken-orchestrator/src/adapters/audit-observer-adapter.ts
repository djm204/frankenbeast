import type { IObserverModule, SpanHandle, TokenSpendData } from '../deps.js';
import type { AuditTrail } from '@frankenbeast/observer';
import { createAuditEvent } from '@frankenbeast/observer';

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
}
