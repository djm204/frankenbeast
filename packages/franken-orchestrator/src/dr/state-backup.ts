import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

export const STATE_BACKUP_FORMAT = 'frankenbeast-dr-state-backup';
export const STATE_BACKUP_SCHEMA_VERSION = 1;

type BackupCategory = 'kanban' | 'approvals' | 'liveness' | 'runs' | 'other';

export interface StateBackupFileManifest {
  readonly path: string;
  readonly category: BackupCategory;
  readonly bytes: number;
  readonly sha256: string;
}

export interface StateBackupManifest {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly sourceDir: string;
  readonly categories: Readonly<Record<BackupCategory, number>>;
  readonly files: readonly StateBackupFileManifest[];
}

export interface StateBackupEnvelope {
  readonly format: typeof STATE_BACKUP_FORMAT;
  readonly schemaVersion: number;
  readonly manifest: StateBackupManifest;
  readonly encryption: {
    readonly encrypted: true;
    readonly algorithm: 'aes-256-gcm';
    readonly kdf: 'sha256-key-file';
    readonly keyRef: string;
    readonly iv: string;
    readonly authTag: string;
    readonly artifactDigest: string;
  };
  readonly ciphertext: string;
}

interface StateBackupPayload {
  readonly manifest: StateBackupManifest;
  readonly files: ReadonlyArray<StateBackupFileManifest & { readonly data: string }>;
}

export interface CreateStateBackupOptions {
  readonly stateDir: string;
  readonly outputPath: string;
  readonly keyFilePath: string;
  readonly generatedAt?: string;
}

export interface RestoreStateBackupOptions {
  readonly backupPath: string;
  readonly targetDir: string;
  readonly keyFilePath: string;
  readonly dryRun?: boolean;
  readonly forceSchema?: boolean;
}

export interface RestoreStateBackupReport {
  readonly ok: true;
  readonly command: 'dr restore';
  readonly dryRun: boolean;
  readonly wouldWrite: boolean;
  readonly backupPath: string;
  readonly targetDir: string;
  readonly manifest: StateBackupManifest;
  readonly restoredFiles: readonly StateBackupFileManifest[];
}

export interface VerifyStateBackupReport {
  readonly ok: true;
  readonly command: 'dr verify';
  readonly encrypted: true;
  readonly backupPath: string;
  readonly manifest: StateBackupManifest;
  readonly verifiedFiles: number;
}

const REQUIRED_CATEGORIES: readonly BackupCategory[] = ['kanban', 'approvals', 'liveness', 'runs'];
const ALL_CATEGORIES: readonly BackupCategory[] = ['kanban', 'approvals', 'liveness', 'runs', 'other'];

function sha256(data: Buffer | string): string {
  return `sha256:${createHash('sha256').update(data).digest('hex')}`;
}

async function deriveKey(keyFilePath: string): Promise<Buffer> {
  const keyMaterial = await readFile(keyFilePath);
  if (keyMaterial.length === 0) {
    throw new Error('DR backup key file must not be empty');
  }
  return createHash('sha256').update(keyMaterial).digest();
}

function classifyBackupPath(path: string): BackupCategory {
  const normalized = path.toLowerCase();
  const base = basename(normalized);
  if (base === 'kanban.db' || base.startsWith('kanban.db-') || normalized.includes(`${sep}kanban${sep}`)) return 'kanban';
  if (normalized.includes('approval') || normalized.includes('ledger')) return 'approvals';
  if (normalized.includes('liveness') || normalized.includes('heartbeat')) return 'liveness';
  if (normalized.startsWith('runs/') || normalized.includes(`${sep}runs${sep}`) || normalized.includes('run-metadata') || normalized.includes('attempt')) return 'runs';
  return 'other';
}

function emptyCategoryCounts(): Record<BackupCategory, number> {
  return { kanban: 0, approvals: 0, liveness: 0, runs: 0, other: 0 };
}

function assertSafeRelativePath(filePath: string): void {
  if (!filePath || filePath.startsWith('/') || filePath.includes('..') || filePath.split(/[\\/]+/).some((part) => part === '..' || part === '')) {
    throw new Error(`Unsafe backup entry path: ${filePath}`);
  }
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort();
}

async function pathIsFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function pathIsDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function resolveBackupRoot(stateDir: string): Promise<string> {
  const root = resolve(stateDir);
  if (basename(root) === '.fbeast' && await pathIsDirectory(join(root, 'state'))) {
    throw new Error('DR backup source must be the concrete .fbeast/state directory, not the parent .fbeast root');
  }
  if (basename(root) === 'state' && await pathIsFile(join(dirname(root), 'beast.db'))) {
    return dirname(root);
  }
  return root;
}

async function discoverBackupFiles(requestedStateDir: string, root: string): Promise<string[]> {
  const requestedRoot = resolve(requestedStateDir);
  if (root !== requestedRoot && basename(requestedRoot) === 'state') {
    const siblingDb = join(root, 'beast.db');
    const siblingDbSidecars = await Promise.all(
      ['-wal', '-shm', '-journal'].map(async (suffix) => {
        const sidecar = `${siblingDb}${suffix}`;
        return await pathIsFile(sidecar) ? sidecar : undefined;
      }),
    );
    return [siblingDb, ...siblingDbSidecars.filter((path): path is string => path !== undefined), ...await walkFiles(requestedRoot)].sort();
  }
  return walkFiles(root);
}

function assertNoLiveSqliteSidecars(relativePaths: readonly string[]): void {
  const sidecar = relativePaths.find((path) => path.endsWith('-wal') || path.endsWith('-shm') || path.endsWith('-journal'));
  if (sidecar) {
    throw new Error(`Refusing to back up live SQLite sidecar ${sidecar}; checkpoint or quiesce SQLite state before DR backup`);
  }
}

async function isExistingBackupArtifact(path: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<StateBackupEnvelope>;
    return parsed.format === STATE_BACKUP_FORMAT && parsed.schemaVersion === STATE_BACKUP_SCHEMA_VERSION;
  } catch {
    return false;
  }
}

async function buildPayload(stateDir: string, generatedAt: string, outputPath: string, keyFilePath: string): Promise<StateBackupPayload> {
  const root = await resolveBackupRoot(stateDir);
  const output = resolve(outputPath);
  const keyFile = resolve(keyFilePath);
  if (output === keyFile) {
    throw new Error('DR backup output path must not be the key file path');
  }
  const rootStats = await stat(root);
  if (!rootStats.isDirectory()) {
    throw new Error(`DR backup source must be a directory: ${stateDir}`);
  }

  const categories = emptyCategoryCounts();
  const discoveredFiles = await discoverBackupFiles(stateDir, root);
  if (discoveredFiles.some((absolutePath) => resolve(absolutePath) === output) && !await isExistingBackupArtifact(output)) {
    throw new Error('DR backup output path aliases a live input file; choose a separate backup artifact path');
  }
  const sourceFiles: string[] = [];
  for (const absolutePath of discoveredFiles) {
    const resolved = resolve(absolutePath);
    if (resolved === output || resolved === keyFile) continue;
    if (await isExistingBackupArtifact(resolved)) continue;
    sourceFiles.push(absolutePath);
  }
  const relativeSourcePaths = sourceFiles.map((absolutePath) => relative(root, absolutePath).split(sep).join('/'));
  assertNoLiveSqliteSidecars(relativeSourcePaths);
  const files = await Promise.all(sourceFiles.map(async (absolutePath) => {
    const rel = relative(root, absolutePath).split(sep).join('/');
    assertSafeRelativePath(rel);
    const data = await readFile(absolutePath);
    const category = classifyBackupPath(rel);
    categories[category] += 1;
    return {
      path: rel,
      category,
      bytes: data.byteLength,
      sha256: sha256(data),
      data: data.toString('base64'),
    };
  }));

  const manifestFiles = files.map(({ data: _data, ...manifest }) => manifest);
  return {
    manifest: {
      schemaVersion: STATE_BACKUP_SCHEMA_VERSION,
      generatedAt,
      sourceDir: root,
      categories,
      files: manifestFiles,
    },
    files,
  };
}

export async function createEncryptedStateBackup(options: CreateStateBackupOptions): Promise<StateBackupEnvelope> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const outputPath = resolve(options.outputPath);
  const payload = await buildPayload(options.stateDir, generatedAt, outputPath, options.keyFilePath);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const key = await deriveKey(options.keyFilePath);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const envelope: StateBackupEnvelope = {
    format: STATE_BACKUP_FORMAT,
    schemaVersion: STATE_BACKUP_SCHEMA_VERSION,
    manifest: payload.manifest,
    encryption: {
      encrypted: true,
      algorithm: 'aes-256-gcm',
      kdf: 'sha256-key-file',
      keyRef: basename(options.keyFilePath),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      artifactDigest: sha256(ciphertext),
    },
    ciphertext: ciphertext.toString('base64'),
  };
  await mkdir(dirname(outputPath), { recursive: true });
  const tmpPath = join(dirname(outputPath), `.${basename(outputPath)}.tmp-${process.pid}-${Date.now()}`);
  await writeFile(tmpPath, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(tmpPath, outputPath).catch(async (error: unknown) => {
    await rm(tmpPath, { force: true });
    throw error;
  });
  return envelope;
}

function parseEnvelope(raw: string, backupPath: string): StateBackupEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read encrypted DR backup ${backupPath}: ${message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid encrypted DR backup ${backupPath}: expected JSON object`);
  }
  const envelope = parsed as Partial<StateBackupEnvelope>;
  if (envelope.format !== STATE_BACKUP_FORMAT || envelope.schemaVersion !== STATE_BACKUP_SCHEMA_VERSION) {
    throw new Error(`Invalid encrypted DR backup ${backupPath}: unsupported backup format or schema version`);
  }
  if (envelope.encryption?.encrypted !== true || envelope.encryption.algorithm !== 'aes-256-gcm') {
    throw new Error(`Invalid encrypted DR backup ${backupPath}: missing supported encryption metadata`);
  }
  if (typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length === 0) {
    throw new Error(`Invalid encrypted DR backup ${backupPath}: missing ciphertext`);
  }
  return envelope as StateBackupEnvelope;
}

export async function readStateBackupEnvelope(backupPath: string): Promise<StateBackupEnvelope> {
  return parseEnvelope(await readFile(backupPath, 'utf8'), backupPath);
}

async function decryptPayload(backupPath: string, keyFilePath: string): Promise<StateBackupPayload> {
  const envelope = await readStateBackupEnvelope(backupPath);
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const expectedDigest = envelope.encryption.artifactDigest.replace(/^sha256:/, '');
  const actualDigest = createHash('sha256').update(ciphertext).digest();
  if (!/^[a-f0-9]{64}$/i.test(expectedDigest) || !timingSafeEqual(Buffer.from(expectedDigest, 'hex'), actualDigest)) {
    throw new Error('Encrypted DR backup artifact digest mismatch; backup may be corrupted or tampered with');
  }

  try {
    const key = await deriveKey(keyFilePath);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.encryption.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.encryption.authTag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(plaintext.toString('utf8')) as StateBackupPayload;
    validatePayload(payload);
    return payload;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Encrypted DR backup artifact digest mismatch')) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to decrypt or verify encrypted DR backup: ${message}`);
  }
}

function validatePayload(payload: StateBackupPayload): void {
  if (payload.manifest.schemaVersion !== STATE_BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported DR backup payload schema version ${String(payload.manifest.schemaVersion)}`);
  }
  for (const category of REQUIRED_CATEGORIES) {
    if (typeof payload.manifest.categories[category] !== 'number') {
      throw new Error(`DR backup manifest is missing ${category} category metadata`);
    }
  }
  for (const file of payload.files) {
    assertSafeRelativePath(file.path);
    if (!ALL_CATEGORIES.includes(file.category)) throw new Error(`Unsupported DR backup category ${String(file.category)}`);
    const data = Buffer.from(file.data, 'base64');
    if (data.byteLength !== file.bytes || sha256(data) !== file.sha256) {
      throw new Error(`DR backup file digest mismatch for ${file.path}`);
    }
  }
}

async function assertNoSymlinkParents(targetDir: string, targetPath: string): Promise<void> {
  const relativeParent = relative(targetDir, dirname(targetPath));
  if (!relativeParent) return;
  let current = targetDir;
  for (const segment of relativeParent.split(sep)) {
    if (!segment || segment === '.') continue;
    current = join(current, segment);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`Refusing to restore through symlinked directory: ${current}`);
      }
      if (!stats.isDirectory()) {
        throw new Error(`Refusing to restore through non-directory path: ${current}`);
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        await mkdir(current, { mode: 0o700 });
        continue;
      }
      throw error;
    }
  }
}

async function ensureRealDirectory(path: string): Promise<void> {
  const parent = dirname(path);
  if (parent !== path) {
    await ensureRealDirectory(parent);
  }
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`DR restore target parent must be a real directory: ${path}`);
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      await mkdir(path, { mode: 0o700 });
      return;
    }
    throw error;
  }
}

async function assertRestoreTargetReady(targetDir: string, createIfMissing: boolean): Promise<void> {
  try {
    const stats = await lstat(targetDir);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`DR restore target must be a real directory: ${targetDir}`);
    }
    const entries = await readdir(targetDir);
    if (entries.length > 0) {
      throw new Error(`Refusing to restore into non-empty target directory: ${targetDir}`);
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      if (createIfMissing) await ensureRealDirectory(targetDir);
      return;
    }
    throw error;
  }
}

function restorePathForFile(file: StateBackupFileManifest): string {
  return file.category === 'approvals' ? join('_quarantine', 'approvals', file.path) : file.path;
}

export async function verifyEncryptedStateBackup(backupPath: string, keyFilePath: string): Promise<VerifyStateBackupReport> {
  const payload = await decryptPayload(backupPath, keyFilePath);
  return {
    ok: true,
    command: 'dr verify',
    encrypted: true,
    backupPath: resolve(backupPath),
    manifest: payload.manifest,
    verifiedFiles: payload.files.length,
  };
}

export async function restoreEncryptedStateBackup(options: RestoreStateBackupOptions): Promise<RestoreStateBackupReport> {
  const payload = await decryptPayload(options.backupPath, options.keyFilePath);
  if (payload.manifest.schemaVersion !== STATE_BACKUP_SCHEMA_VERSION && options.forceSchema !== true) {
    throw new Error(`Refusing to restore schema version ${String(payload.manifest.schemaVersion)} without forceSchema`);
  }
  const dryRun = options.dryRun === true;
  const targetDir = resolve(options.targetDir);
  await assertRestoreTargetReady(targetDir, !dryRun);
  const restoredFiles = payload.files.map((file) => ({ ...file, path: restorePathForFile(file) }));
  if (!dryRun) {
    for (const file of payload.files) {
      const restorePath = restorePathForFile(file);
      const targetPath = resolve(targetDir, restorePath);
      if (!targetPath.startsWith(`${targetDir}${sep}`)) {
        throw new Error(`Unsafe backup entry path: ${file.path}`);
      }
      await assertNoSymlinkParents(targetDir, targetPath);
      const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(tmpPath, Buffer.from(file.data, 'base64'), { mode: 0o600 });
      await rename(tmpPath, targetPath).catch(async (error: unknown) => {
        await rm(tmpPath, { force: true });
        throw error;
      });
    }
  }
  return {
    ok: true,
    command: 'dr restore',
    dryRun,
    wouldWrite: !dryRun,
    backupPath: resolve(options.backupPath),
    targetDir,
    manifest: payload.manifest,
    restoredFiles,
  };
}
