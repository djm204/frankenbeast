import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface PhaseSnapshot {
  readonly runId: string;
  readonly phase: string;
  readonly previousPhase: string | null;
  readonly timestamp: string;
  readonly projectId?: string | undefined;
}

export class StateSnapshotStore {
  private readonly file: string;
  private previousPhase: string | null = null;

  constructor(stateDir: string, runId: string) {
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }
    this.file = join(stateDir, `${runId}.jsonl`);
  }

  record(snapshot: Omit<PhaseSnapshot, 'previousPhase' | 'timestamp'>): void {
    const full: PhaseSnapshot = {
      ...snapshot,
      previousPhase: this.previousPhase,
      timestamp: new Date().toISOString(),
    };
    appendFileSync(this.file, `${JSON.stringify(full)}\n`, 'utf8');
    this.previousPhase = snapshot.phase;
  }
}
