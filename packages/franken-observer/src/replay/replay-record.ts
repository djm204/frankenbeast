import { createHash } from 'node:crypto';

export type ReplayRecordKind =
  | 'llm.request'
  | 'llm.response'
  | 'tool.call'
  | 'tool.result'
  | 'environment.snapshot';

export interface ReplayRecord {
  readonly version: 1;
  readonly kind: ReplayRecordKind;
  readonly runId: string;
  readonly timestamp: string;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly toolName?: string | undefined;
  readonly contentRef: string;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
