import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
    if (existsSync(path) && contentHashMatches(readFileSync(path, 'utf8'), ref)) {
      return ref;
    }

    this.writeBlobAtomically(ref, content, path);
    return ref;
  }

  get(ref: string): string {
    const content = readFileSync(this.blobPath(ref), 'utf8');
    if (!contentHashMatches(content, ref)) {
      throw new Error(`Replay blob hash mismatch for ${ref}`);
    }
    return content;
  }

  private writeBlobAtomically(ref: string, content: string, finalPath: string): void {
    const tempName = `.${ref}.${process.pid}.${randomUUID()}.tmp`;
    const tempPath = resolveContainedPath(this.dir, tempName, 'replayBlobTempPath');

    try {
      writeFileSync(tempPath, content, 'utf8');
      renameSync(tempPath, finalPath);
    } catch (err) {
      rmSync(tempPath, { force: true });
      throw err;
    }
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
