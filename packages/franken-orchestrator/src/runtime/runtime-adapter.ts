import type { RuntimeEventPage, RuntimeProvider, RuntimeSnapshot } from './runtime-schemas.js';

export interface RuntimeSnapshotRequest {
  workspaceId?: string | undefined;
  activityLimit?: number | undefined;
}

export interface RuntimeEventRequest {
  cursor?: string | undefined;
  workspaceId?: string | undefined;
  limit?: number | undefined;
}

export interface RuntimeAdapter {
  readonly id: string;
  describe(): Promise<RuntimeProvider>;
  getSnapshot(request?: RuntimeSnapshotRequest): Promise<RuntimeSnapshot>;
  getEvents(request?: RuntimeEventRequest): Promise<RuntimeEventPage>;
}
