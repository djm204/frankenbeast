import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentHashMatches } from '../utils/crypto.js';
import { hashContent } from './replay-record.js';

export class ReplayContentStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'blobs');
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  put(content: string): string {
    const ref = hashContent(content);
    const path = this.blobPath(ref);
    if (!existsSync(path)) {
      writeFileSync(path, content, 'utf8');
    }
    return ref;
  }

  get(ref: string): string {
    const content = readFileSync(this.blobPath(ref), 'utf8');
    if (!contentHashMatches(content, ref)) {
      throw new Error(`Replay blob hash mismatch for ${ref}`);
    }
    return content;
  }

  __corruptForTest(ref: string, replacement: string): void {
    writeFileSync(this.blobPath(ref), replacement, 'utf8');
  }

  private blobPath(ref: string): string {
    return join(this.dir, ref.replace(/^sha256:/, ''));
  }
}
