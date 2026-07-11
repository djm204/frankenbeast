import { chmod, lstat, mkdir, readFile, readlink, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, basename, isAbsolute, resolve as resolvePath, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface JsonCorruptionRecovery {
  description: string;
  filePath: string;
  quarantinePath: string;
  error: unknown;
}

function isJsonSyntaxError(error: unknown): error is SyntaxError {
  return error instanceof SyntaxError;
}

function quarantinePathFor(filePath: string): string {
  return `${filePath}.corrupt-${Date.now()}-${process.pid}-${randomUUID()}`;
}

const recoveredFileModes = new Map<string, number>();

function isInsideDirectory(filePath: string, directory: string): boolean {
  const rel = relative(resolvePath(directory), resolvePath(filePath));
  return rel.length === 0 || (!rel.startsWith('..') && !rel.includes(`..${sep}`) && !isAbsolute(rel));
}

async function resolveSafeSymlinkTargetPath(filePath: string): Promise<string> {
  const info = await lstat(filePath);
  if (!info.isSymbolicLink()) {
    return filePath;
  }
  const linkTarget = await readlink(filePath);
  const targetPath = isAbsolute(linkTarget) ? linkTarget : resolvePath(dirname(filePath), linkTarget);
  return isInsideDirectory(targetPath, dirname(filePath)) ? targetPath : filePath;
}

async function resolveExistingOrSymlinkTarget(filePath: string): Promise<string> {
  try {
    return await resolveSafeSymlinkTargetPath(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return filePath;
    }
    throw error;
  }
}

export async function readJsonFileOrDefault<T>(
  filePath: string,
  fallback: () => T,
  options: {
    description: string;
    onCorrupt?: (recovery: JsonCorruptionRecovery) => void;
  },
): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback();
    }
    throw error;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    if (!isJsonSyntaxError(error)) {
      throw error;
    }
    const targetPath = await resolveExistingOrSymlinkTarget(filePath);
    const quarantinePath = quarantinePathFor(targetPath);
    const targetMode = await stat(targetPath).then((info) => info.mode & 0o777).catch(() => undefined);
    await rename(targetPath, quarantinePath);
    if (targetMode !== undefined) {
      recoveredFileModes.set(filePath, targetMode);
      recoveredFileModes.set(targetPath, targetMode);
    }
    options.onCorrupt?.({ description: options.description, filePath, quarantinePath, error });
    return fallback();
  }
}

async function resolveAtomicWriteTarget(filePath: string): Promise<{ targetPath: string; mode?: number | undefined }> {
  const targetPath = await resolveExistingOrSymlinkTarget(filePath);
  try {
    const targetInfo = await stat(targetPath);
    return { targetPath, mode: targetInfo.mode & 0o777 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { targetPath, mode: recoveredFileModes.get(targetPath) ?? recoveredFileModes.get(filePath) };
    }
    throw error;
  }
}

export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  const { targetPath, mode } = await resolveAtomicWriteTarget(filePath);
  await mkdir(dirname(targetPath), { recursive: true });
  const tempPath = join(dirname(targetPath), `.${basename(targetPath)}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`);
  try {
    await writeFile(tempPath, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf-8', mode });
    if (mode !== undefined) {
      await chmod(tempPath, mode);
    }
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function warnJsonQuarantined({ description, filePath, quarantinePath, error }: JsonCorruptionRecovery): void {
  console.warn(
    `Malformed ${description} JSON in ${filePath}; quarantined original at ${quarantinePath} and continuing with defaults. ${error instanceof Error ? error.message : String(error)}`,
  );
}
