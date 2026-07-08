#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const defaultRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const root = process.env.FRANKENBEAST_DEBT_SCAN_ROOT ?? defaultRoot;
const selfPath = fileURLToPath(import.meta.url);
const selfRepoPath = 'scripts/audit-todo-markers.mjs';
const sourceRoots = ['packages', 'scripts'];
const scannedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
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

function scriptKindFor(path) {
  switch (extname(path)) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
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
  return comment.trim().replace(/^\*\s?/gm, '').replace(/\s+/g, ' ').slice(0, 160);
}

function commentText(source, range) {
  const raw = source.slice(range.pos, range.end);
  if (raw.startsWith('//')) {
    return raw.slice(2);
  }
  if (raw.startsWith('/*') && raw.endsWith('*/')) {
    return raw.slice(2, -2);
  }
  return raw;
}

function recordComment(sourceFile, source, range, file, findings) {
  const text = commentText(source, range);
  const match = markerPattern.exec(text);
  if (!match) return;
  const { line } = sourceFile.getLineAndCharacterOfPosition(range.pos);
  findings.push({
    path: toRepoPath(file),
    line: line + 1,
    marker: match[1].toUpperCase(),
    excerpt: normalizeExcerpt(text),
  });
}

function collectComments(sourceFile, source, file) {
  const findings = [];
  const seen = new Set();

  function collectRanges(ranges) {
    for (const range of ranges ?? []) {
      const key = `${range.pos}:${range.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      recordComment(sourceFile, source, range, file, findings);
    }
  }

  collectRanges(ts.getLeadingCommentRanges(source, 0));

  function visit(node) {
    collectRanges(ts.getLeadingCommentRanges(source, node.pos));
    collectRanges(ts.getTrailingCommentRanges(source, node.end));
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

async function scanFile(file) {
  const source = await readFile(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(file),
  );
  return collectComments(sourceFile, source, file);
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
