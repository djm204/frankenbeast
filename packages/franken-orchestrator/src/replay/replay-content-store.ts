import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SHA256_HEX_REF = /^[a-f0-9]{64}$/;

export type ReplayRecordKind = 'llm.request' | 'llm.response' | 'tool.call' | 'tool.result' | 'environment.snapshot';

export interface ReplayRecord {
  readonly version: 1;
  readonly kind: ReplayRecordKind;
  readonly runId: string;
  readonly timestamp: string;
  readonly provider?: string;
  readonly model?: string;
  readonly toolName?: string;
  readonly contentRef: string;
}

export interface ReplayContentStoreLike {
  put(content: string): string;
  get(contentRef: string): string;
}

export class ReplayContentStore implements ReplayContentStoreLike {
  private readonly blobsDir: string;

  constructor(auditRoot: string) {
    this.blobsDir = join(auditRoot, 'blobs');
    mkdirSync(this.blobsDir, { recursive: true });
  }

  put(content: string): string {
    const digest = createHash('sha256').update(content).digest('hex');
    writeFileSync(join(this.blobsDir, digest), content, 'utf8');
    return digest;
  }

  get(contentRef: string): string {
    if (!SHA256_HEX_REF.test(contentRef)) {
      throw new Error('Replay content ref must be exactly 64 lowercase sha256 hex characters');
    }

    return readFileSync(join(this.blobsDir, contentRef), 'utf8');
  }
}
