export interface EpisodicTraceRecord {
  readonly id: string;
  readonly type: 'episodic';
  readonly projectId: string;
  readonly status: 'success' | 'failure';
  readonly createdAt: number;
  readonly taskId: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly tags: string[];
}

export interface GovernorMemoryPort {
  recordDecision(trace: EpisodicTraceRecord): Promise<void>;
}
