import { chmodSync, closeSync, copyFileSync, fsyncSync, lstatSync, openSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export function parseJsonObjectWithComments(content: string): Record<string, unknown> {
  const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(content));
  if (!isRecord(parsed)) {
    throw new Error('settings.json must contain a JSON object');
  }
  return parsed;
}

export function readSettingsJson(content: string): Record<string, unknown> {
  return parseJsonObjectWithComments(content);
}

export function recoverInvalidJsonFile(path: string, error: unknown): Record<string, unknown> {
  const backupPath = join(dirname(path), `${basename(path)}.invalid-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.bak`);
  copyFileSync(path, backupPath);
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`fbeast: ${path} is not valid JSON (${reason}); backed it up to ${backupPath} and will recreate it.`);
  return {};
}

export function readJsonObjectFileOrRecover(path: string, content: string): Record<string, unknown> {
  try {
    return parseJsonObjectWithComments(content);
  } catch (error) {
    return recoverInvalidJsonFile(path, error);
  }
}

export function writeJsonFileAtomic(path: string, value: unknown): void {
  const content = JSON.stringify(value, null, 2) + '\n';
  const targetPath = resolveAtomicWriteTarget(path);
  const existingMode = getExistingFileMode(targetPath);
  const dir = dirname(targetPath);
  let tempPath = join(dir, `.${basename(targetPath)}.tmp-${randomUUID()}`);

  try {
    for (;;) {
      try {
        writeFileSync(tempPath, content, { encoding: 'utf-8', flag: 'wx', mode: existingMode });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        tempPath = join(dir, `.${basename(targetPath)}.tmp-${randomUUID()}`);
      }
    }
    if (existingMode !== undefined) chmodSync(tempPath, existingMode);
    fsyncFile(tempPath);
    renameSync(tempPath, targetPath);
    fsyncDirectory(dir);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveAtomicWriteTarget(path: string): string {
  try {
    if (!lstatSync(path).isSymbolicLink()) return path;
    try {
      return realpathSync(path);
    } catch (error) {
      if (!isNotFound(error)) throw error;
      return resolve(dirname(path), readlinkSync(path));
    }
  } catch (error) {
    if (isNotFound(error)) return path;
    throw error;
  }
}

function getExistingFileMode(path: string): number | undefined {
  try {
    return statSync(path).mode & 0o777;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code === 'ENOENT';
}

function stripJsonCommentsAndTrailingCommas(content: string): string {
  let output = '';
  let inString = false;
  let escaping = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]!;
    const next = content[i + 1];

    if (inLineComment) {
      if (char === '\n' || char === '\r') {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      } else if (char === '\n' || char === '\r') {
        output += char;
      } else {
        output += ' ';
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      output += ' ';
      i += 1;
      continue;
    }

    output += char;
  }

  return removeTrailingCommas(output);
}

function removeTrailingCommas(content: string): string {
  let output = '';
  let inString = false;
  let escaping = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]!;

    if (inString) {
      output += char;
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === ',') {
      const nextSignificant = findNextSignificantChar(content, i + 1);
      if (nextSignificant === '}' || nextSignificant === ']') {
        continue;
      }
    }

    output += char;
  }

  return output;
}

function findNextSignificantChar(content: string, start: number): string | undefined {
  for (let i = start; i < content.length; i += 1) {
    const char = content[i]!;
    if (!/\s/.test(char)) return char;
  }
  return undefined;
}

function fsyncFile(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function fsyncDirectory(path: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    fsyncSync(fd);
  } catch (error) {
    if (!isUnsupportedDirectoryFsync(error)) throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function isUnsupportedDirectoryFsync(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code !== undefined
    && ['EINVAL', 'EISDIR', 'EPERM', 'ENOTSUP'].includes((error as { code: string }).code);
}
