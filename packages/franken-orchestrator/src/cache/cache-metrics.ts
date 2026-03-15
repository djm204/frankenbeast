export interface CacheMetricsSnapshot {
  managedResponseHits: number;
  managedResponseMisses: number;
  projectStableHits: number;
  nativeSessionAttempts: number;
  nativeSessionHits: number;
  nativeSessionFallbacks: number;
  innerCalls: number;
}

export class CacheMetrics {
  private readonly counts: CacheMetricsSnapshot = {
    managedResponseHits: 0,
    managedResponseMisses: 0,
    projectStableHits: 0,
    nativeSessionAttempts: 0,
    nativeSessionHits: 0,
    nativeSessionFallbacks: 0,
    innerCalls: 0,
  };

  recordManagedResponseHit(): void {
    this.counts.managedResponseHits++;
  }

  recordManagedResponseMiss(): void {
    this.counts.managedResponseMisses++;
  }

  recordProjectStableHit(): void {
    this.counts.projectStableHits++;
  }

  recordNativeSessionAttempt(): void {
    this.counts.nativeSessionAttempts++;
  }

  recordNativeSessionHit(): void {
    this.counts.nativeSessionHits++;
  }

  recordNativeSessionFallback(): void {
    this.counts.nativeSessionFallbacks++;
  }

  recordInnerCall(): void {
    this.counts.innerCalls++;
  }

  snapshot(): CacheMetricsSnapshot {
    return { ...this.counts };
  }
}
