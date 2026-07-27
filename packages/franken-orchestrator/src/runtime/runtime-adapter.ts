import type { RuntimeEventPage, RuntimeProvider, RuntimeSnapshot } from './runtime-schemas.js';

export interface RuntimeSnapshotRequest {
  workspaceId?: string | undefined;
  activityLimit?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface RuntimeEventRequest {
  cursor?: string | undefined;
  workspaceId?: string | undefined;
  limit?: number | undefined;
  signal?: AbortSignal | undefined;
}

export class RuntimeCursorError extends Error {
  readonly code = 'INVALID_CURSOR';

  constructor(message = 'Invalid runtime event cursor') {
    super(message);
    this.name = 'RuntimeCursorError';
  }
}

export interface RuntimeAdapter {
  readonly id: string;
  describe(): Promise<RuntimeProvider>;
  getSnapshot(request?: RuntimeSnapshotRequest): Promise<RuntimeSnapshot>;
  getEvents(request?: RuntimeEventRequest): Promise<RuntimeEventPage>;
  validateEventCursor(cursor: string): void;
}
