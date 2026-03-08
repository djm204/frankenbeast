import type { EpisodicTrace } from '../types/index.js';

export interface IEpisodicStore {
  record(trace: EpisodicTrace): string | Promise<string>;
  query(taskId: string, projectId?: string): EpisodicTrace[];
  queryFailed(projectId: string): EpisodicTrace[];
  markCompressed(ids: string[]): void;
  count(projectId: string, taskId: string): number;
}
