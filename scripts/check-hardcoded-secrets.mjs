#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const root = process.env.FRANKENBEAST_SECRETS_SCAN_ROOT ?? defaultRoot;
const scannedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const sourceRoots = ['packages', 'scripts'];
const ignoredPathParts = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.turbo',
  '.vite',
  'test',
  'tests',
  '__tests__',
  'fixtures',
]);

const sensitiveEnvNames = [
  ['AWS', 'ACCESS', 'KEY', 'ID'],
  ['AWS', 'SECRET', 'ACCESS', 'KEY'],
  ['JWT', 'SECRET'],
  ['SECRET', 'KEY'],
].map((parts) => parts.join('_'));

const sensitiveNamePattern = new RegExp(`\\b(?:${sensitiveEnvNames.join('|')})\\b`, 'i');
const stringLiteralPattern = /(['"`])((?:\\.|(?!\1).)*)\1/g;

function printLine(...args) {
  console.info(...args);
}

function extensionOf(path) {
  const match = /\.[^.]+$/.exec(path);
  return match?.[0] ?? '';
}

function toRepoPath(path) {
  return relative(root, path).split(sep).join('/');
}

function shouldScanSource(path) {
  const rel = toRepoPath(path);
  const parts = rel.split('/');
  if (parts.some((part) => ignoredPathParts.has(part))) {
    return false;
  }
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) {
    return false;
  }
  return scannedExtensions.has(extensionOf(path));
}

async function* walk(dir, shouldScan) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredPathParts.has(entry.name)) {
        yield* walk(fullPath, shouldScan);
      }
      continue;
    }
    if (entry.isFile() && shouldScan(fullPath)) {
      yield fullPath;
    }
  }
}

async function collectEnvironmentExampleFiles() {
  const files = [];
  for await (const file of walk(root, (path) => /(^|\/)\.env(?:\.[^/]*)?example$|(^|\/)example\.env$/i.test(path))) {
    files.push(file);
  }
  return files;
}

function hasHardcodedSensitiveEnvValue(line) {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith('#')) {
    return false;
  }
  const match = trimmed.match(/^([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|ACCESS)[A-Z0-9_]*)=(.*)$/);
  if (!match) {
    return false;
  }
  const [, name, value] = match;
  return sensitiveNamePattern.test(name) && value.trim().length > 0;
}

function hasHardcodedSensitiveSourceValue(line) {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) {
    return false;
  }
  if (!sensitiveNamePattern.test(line)) {
    return false;
  }

  for (const match of line.matchAll(stringLiteralPattern)) {
    const literal = match[2].trim();
    if (!literal || sensitiveEnvNames.some((name) => name.toLowerCase() === literal.toLowerCase())) {
      continue;
    }
    const prefix = line.slice(0, match.index);
    if (/(=|:|\?\?|\|\|)\s*$/.test(prefix) || /process\.env\./.test(prefix)) {
      return true;
    }
  }
  return false;
}

async function scanFile(file, predicate, findings) {
  const content = await readFile(file, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (predicate(line)) {
      findings.push(`${toRepoPath(file)}:${index + 1}: ${line.trim()}`);
    }
  }
}

const findings = [];

for (const file of await collectEnvironmentExampleFiles()) {
  await scanFile(file, hasHardcodedSensitiveEnvValue, findings);
}

for (const scanRoot of sourceRoots) {
  for await (const file of walk(join(root, scanRoot), shouldScanSource)) {
    if (fileURLToPath(import.meta.url) === file) {
      continue;
    }
    await scanFile(file, hasHardcodedSensitiveSourceValue, findings);
  }
}

if (findings.length > 0) {
  console.error('Hard-coded example secret values are not allowed. Read them from the environment or leave example values commented/blank.');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

printLine('No hard-coded example secret values found in environment examples or production sources.');
