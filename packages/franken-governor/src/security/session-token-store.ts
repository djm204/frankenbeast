import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { SessionToken } from '../core/types.js';

const LOCK_RETRY_MS = 10;
const LOCK_TIMEOUT_MS = 5_000;

export interface SessionTokenStoreOptions {
  /**
   * Optional JSON persistence file shared by short-lived governor processes.
   * When omitted, the store remains in-memory only.
   */
  readonly persistenceFile?: string;
}

interface SerializedSessionToken {
  readonly tokenId: string;
  readonly approvalId: string;
  readonly scope: string;
  readonly grantedBy: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
}

export class SessionTokenStore {
  private readonly tokens = new Map<string, SessionToken>();
  private readonly persistenceFile: string | undefined;

  constructor(options: SessionTokenStoreOptions = {}) {
    this.persistenceFile = options.persistenceFile;
    this.loadPersistedTokens();
  }

  store(token: SessionToken): void {
    if (!this.persistenceFile) {
      this.tokens.set(token.tokenId, token);
      return;
    }

    this.withFileLock(() => {
      this.loadPersistedTokens();
      this.tokens.set(token.tokenId, token);
      this.persist();
    });
  }

  get(tokenId: string): SessionToken | undefined {
    this.loadPersistedTokens();
    const token = this.tokens.get(tokenId);
    if (token === undefined) return undefined;

    if (this.isExpired(token)) {
      this.tokens.delete(tokenId);
      return undefined;
    }

    return token;
  }

  revoke(tokenId: string): void {
    if (!this.persistenceFile) {
      this.tokens.delete(tokenId);
      return;
    }

    this.withFileLock(() => {
      this.loadPersistedTokens();
      this.tokens.delete(tokenId);
      this.persist();
    });
  }

  isValid(tokenId: string, scope?: string): boolean {
    const token = this.get(tokenId);
    if (!token) return false;
    return scope === undefined || token.scope === scope;
  }

  private loadPersistedTokens(): void {
    if (!this.persistenceFile) return;

    let raw: string;
    try {
      raw = readFileSync(this.persistenceFile, 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.tokens.clear();
        return;
      }
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Unable to read session token store: ${(err as Error).message}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Unable to read session token store: expected an array');
    }

    this.tokens.clear();
    for (const value of parsed) {
      const token = this.deserialize(value);
      if (token && !this.isExpired(token)) {
        this.tokens.set(token.tokenId, token);
      }
    }

    // Expired entries are ignored on read and pruned on the next write.
  }

  private deserialize(value: unknown): SessionToken | null {
    if (!value || typeof value !== 'object') return null;
    const token = value as Partial<SerializedSessionToken>;
    if (
      typeof token.tokenId !== 'string'
      || typeof token.approvalId !== 'string'
      || typeof token.scope !== 'string'
      || typeof token.grantedBy !== 'string'
      || typeof token.grantedAt !== 'string'
      || typeof token.expiresAt !== 'string'
    ) {
      return null;
    }

    const grantedAt = new Date(token.grantedAt);
    const expiresAt = new Date(token.expiresAt);
    if (Number.isNaN(grantedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
      return null;
    }

    return {
      tokenId: token.tokenId,
      approvalId: token.approvalId,
      scope: token.scope,
      grantedBy: token.grantedBy,
      grantedAt,
      expiresAt,
    };
  }

  private withFileLock<T>(operation: () => T): T {
    if (!this.persistenceFile) return operation();

    mkdirSync(dirname(this.persistenceFile), { recursive: true, mode: 0o700 });
    const lockPath = `${this.persistenceFile}.lock`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    let lockFd: number | undefined;

    while (lockFd === undefined) {
      try {
        lockFd = openSync(lockPath, 'wx', 0o600);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST' || Date.now() >= deadline) {
          throw err;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS);
      }
    }

    try {
      return operation();
    } finally {
      closeSync(lockFd);
      try {
        unlinkSync(lockPath);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') throw err;
      }
    }
  }

  private persist(): void {
    if (!this.persistenceFile) return;

    const payload: SerializedSessionToken[] = [...this.tokens.values()]
      .filter((token) => !this.isExpired(token))
      .map((token) => ({
        tokenId: token.tokenId,
        approvalId: token.approvalId,
        scope: token.scope,
        grantedBy: token.grantedBy,
        grantedAt: token.grantedAt.toISOString(),
        expiresAt: token.expiresAt.toISOString(),
      }));

    mkdirSync(dirname(this.persistenceFile), { recursive: true, mode: 0o700 });
    const tmpPath = `${this.persistenceFile}.${process.pid}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmpPath, this.persistenceFile);
  }

  private isExpired(token: SessionToken): boolean {
    return Date.now() >= token.expiresAt.getTime();
  }
}
