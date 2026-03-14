export interface CacheStoreOptions {
  schemaVersion: number;
}

export interface CacheScope {
  projectId: string;
  workId?: string | undefined;
}

export interface CacheEntryMetadata {
  kind: 'project' | 'work';
  provider?: string | undefined;
  [key: string]: unknown;
}

export interface CacheEntry {
  content: string;
  fingerprint: string;
  createdAt: string;
  metadata: CacheEntryMetadata;
}

export interface StoredCacheEntry extends CacheEntry {
  schemaVersion: number;
}

export interface ProviderSessionRecord {
  projectId: string;
  workId: string;
  provider: string;
  model: string;
  sessionId: string;
  promptFingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredProviderSessionRecord extends ProviderSessionRecord {
  schemaVersion: number;
}

export interface ProviderSessionLookup {
  projectId: string;
  workId: string;
  provider: string;
  model: string;
  promptFingerprint: string;
}

export function encodeCachePathSegment(value: string): string {
  return encodeURIComponent(value);
}
