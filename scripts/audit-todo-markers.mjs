#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const root = process.env.FRANKENBEAST_DEBT_SCAN_ROOT ?? defaultRoot;
const selfPath = fileURLToPath(import.meta.url);
const selfRepoPath = 'scripts/audit-todo-markers.mjs';
const sourceRoots = ['packages', 'scripts'];
const scannedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
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
const markerNames = [
  ['TO', 'DO'].join(''),
  ['FIX', 'ME'].join(''),
  ['HA', 'CK'].join(''),
];
const markerPattern = new RegExp(`\\b(${markerNames.join('|')})(?:\\b|:)`, 'i');

function toRepoPath(path) {
  return relative(root, path).split(sep).join('/');
}

function shouldScan(path) {
  const rel = toRepoPath(path);
  const parts = rel.split('/');
  if (parts.some((part) => ignoredPathParts.has(part))) {
    return false;
  }
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) {
    return false;
  }
  return scannedExtensions.has(extname(path));
}

async function* walk(dir) {
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
        yield* walk(fullPath);
      }
      continue;
    }
    if (entry.isFile() && shouldScan(fullPath) && fullPath !== selfPath && toRepoPath(fullPath) !== selfRepoPath) {
      yield fullPath;
    }
  }
}

function normalizeExcerpt(comment) {
  return comment.trim().replace(/\s+/g, ' ').slice(0, 160);
}

function recordComment(comment, file, lineNumber, findings) {
  const match = markerPattern.exec(comment);
  if (!match) return;
  findings.push({
    path: toRepoPath(file),
    line: lineNumber,
    marker: match[1].toUpperCase(),
    excerpt: normalizeExcerpt(comment),
  });
}

async function scanFile(file) {
  const content = await readFile(file, 'utf8');
  const lines = content.split(/\r?\n/);
  const findings = [];
  const state = { quote: null, escaped: false, inBlock: false };

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    let comment = '';

    for (let cursor = 0; cursor < line.length; cursor += 1) {
      const char = line[cursor];
      const next = line[cursor + 1];

      if (state.inBlock) {
        if (char === '*' && next === '/') {
          recordComment(comment, file, lineNumber, findings);
          comment = '';
          state.inBlock = false;
          cursor += 1;
          continue;
        }
        comment += char;
        continue;
      }

      if (state.quote) {
        if (state.escaped) {
          state.escaped = false;
        } else if (char === '\\') {
          state.escaped = true;
        } else if (char === state.quote) {
          state.quote = null;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        state.quote = char;
        continue;
      }

      if (char === '/' && next === '/') {
        recordComment(line.slice(cursor + 2), file, lineNumber, findings);
        break;
      }

      if (char === '/' && next === '*') {
        state.inBlock = true;
        comment = '';
        cursor += 1;
      }
    }

    if (state.inBlock && comment) {
      recordComment(comment, file, lineNumber, findings);
    }

    if (state.quote !== '`') {
      state.quote = null;
      state.escaped = false;
    }
  }

  return findings;
}

const findings = [];
for (const sourceRoot of sourceRoots) {
  for await (const file of walk(join(root, sourceRoot))) {
    findings.push(...await scanFile(file));
  }
}

findings.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    scannedRoots: sourceRoots,
    markers: markerNames,
    totalFindings: findings.length,
    findings,
  }, null, 2));
} else if (findings.length === 0) {
  console.log('No tracked code-comment markers found in production JavaScript/TypeScript sources.');
} else {
  console.error(`Tracked code-comment markers found (${findings.length}). Convert them into issues or remove the stale comments:`);
  for (const finding of findings) {
    console.error(`- ${finding.path}:${finding.line}: ${finding.marker}: ${finding.excerpt}`);
  }
}

if (findings.length > 0) {
  process.exitCode = 1;
}
