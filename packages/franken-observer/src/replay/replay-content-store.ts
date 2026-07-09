import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolveContainedExistingPath, resolveContainedPath } from '@franken/types/path-containment';
import { contentHashMatches } from '../utils/crypto.js';
import { hashContent } from './replay-record.js';

const SHA256_HEX_REF = /^[a-f0-9]{64}$/;

export class ReplayContentStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    const blobDir = resolveContainedPath(baseDir, 'blobs', 'replayBlobsDir');
    mkdirSync(blobDir, { recursive: true });
    this.dir = resolveContainedExistingPath(baseDir, 'blobs', 'replayBlobsDir');
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

  private blobPath(ref: string): string {
    if (!SHA256_HEX_REF.test(ref)) {
      throw new Error('Replay content ref must be exactly 64 lowercase sha256 hex characters');
    }
    const containedPath = resolveContainedPath(this.dir, ref, 'replayBlobPath');
    try {
      if (lstatSync(containedPath).isSymbolicLink()) {
        throw new Error('replayBlobPath must not be a symbolic link');
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
    return existsSync(containedPath)
      ? resolveContainedExistingPath(this.dir, ref, 'replayBlobPath')
      : containedPath;
  }
}
