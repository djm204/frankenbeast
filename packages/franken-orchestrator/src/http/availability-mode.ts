export type AvailabilityMode = 'read-write' | 'read-only-degraded';

export interface AvailabilityModeSnapshot {
  readonly mode: AvailabilityMode;
  readonly readOnly: boolean;
  readonly enteredAt?: string | undefined;
  readonly reason?: string | undefined;
  readonly source?: 'automatic' | 'operator' | undefined;
}

export interface AvailabilityModeState {
  snapshot(): AvailabilityModeSnapshot;
  enterReadOnlyDegraded(reason: string, source: 'automatic' | 'operator', now?: string): AvailabilityModeSnapshot;
  leaveReadOnlyDegraded(): AvailabilityModeSnapshot;
}

export class InMemoryAvailabilityModeState implements AvailabilityModeState {
  private current: AvailabilityModeSnapshot = {
    mode: 'read-write',
    readOnly: false,
  };

  snapshot(): AvailabilityModeSnapshot {
    return this.current;
  }

  enterReadOnlyDegraded(
    reason: string,
    source: 'automatic' | 'operator',
    now = new Date().toISOString(),
  ): AvailabilityModeSnapshot {
    this.current = {
      mode: 'read-only-degraded',
      readOnly: true,
      enteredAt: now,
      reason,
      source,
    };
    return this.current;
  }

  leaveReadOnlyDegraded(): AvailabilityModeSnapshot {
    this.current = {
      mode: 'read-write',
      readOnly: false,
    };
    return this.current;
  }
}

export function availabilityModeDenialDetails(snapshot: AvailabilityModeSnapshot): {
  readonly mode: AvailabilityMode;
  readonly readOnly: boolean;
  readonly enteredAt?: string | undefined;
  readonly reason?: string | undefined;
  readonly source?: 'automatic' | 'operator' | undefined;
} {
  return {
    mode: snapshot.mode,
    readOnly: snapshot.readOnly,
    enteredAt: snapshot.enteredAt,
    reason: snapshot.reason,
    source: snapshot.source,
  };
}
