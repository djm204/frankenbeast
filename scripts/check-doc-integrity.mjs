#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('..', import.meta.url));
const root = process.env.FRANKENBEAST_DOCS_SCAN_ROOT ?? defaultRoot;
const docsRoot = join(root, 'docs');
const openingMarkerPattern = /^(<{3,})(?:\s.*)?$/u;
const separatorMarkerPattern = /^(={3,})(?:\s.*)?$/u;
const closingMarkerPattern = /^(>{3,})(?:\s.*)?$/u;
const ignoredDirectories = new Set(['generated', 'node_modules', 'vendor']);

function toRepoPath(path) {
  return relative(root, path).split(sep).join('/');
}

async function* walkMarkdown(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        yield* walkMarkdown(path);
      }
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      yield path;
    }
  }
}

async function scanFile(path) {
  const source = await readFile(path, 'utf8');
  const findings = [];
  let conflict = null;

  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    const openingMatch = openingMarkerPattern.exec(line);
    if (openingMatch) {
      const finding = { path: toRepoPath(path), line: index + 1, marker: openingMatch[1] };
      if (openingMatch[1].length >= 7) {
        findings.push(finding);
        conflict = null;
      } else {
        conflict = {
          width: openingMatch[1].length,
          sawSeparator: false,
          findings: [finding],
        };
      }
      continue;
    }

    const closingMatch = closingMarkerPattern.exec(line);
    if (closingMatch?.[1].length >= 7) {
      findings.push({ path: toRepoPath(path), line: index + 1, marker: closingMatch[1] });
      conflict = null;
      continue;
    }
    if (!conflict) continue;

    const separatorMatch = separatorMarkerPattern.exec(line);
    if (separatorMatch?.[1].length === conflict.width) {
      conflict.sawSeparator = true;
      conflict.findings.push({
        path: toRepoPath(path),
        line: index + 1,
        marker: separatorMatch[1],
      });
      continue;
    }

    if (closingMatch?.[1].length === conflict.width && conflict.sawSeparator) {
      conflict.findings.push({
        path: toRepoPath(path),
        line: index + 1,
        marker: closingMatch[1],
      });
      findings.push(...conflict.findings);
      conflict = null;
    }
  }

  return findings;
}

const findings = [];
for await (const path of walkMarkdown(docsRoot)) {
  findings.push(...await scanFile(path));
}
findings.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ scannedRoots: ['docs'], totalFindings: findings.length, findings }, null, 2));
} else if (findings.length === 0) {
  console.log('No unresolved merge markers found in maintained Markdown under docs/.');
} else {
  console.error(`Unresolved merge markers found in maintained Markdown (${findings.length}):`);
  for (const finding of findings) {
    console.error(`- ${finding.path}:${finding.line}: ${finding.marker}`);
  }
}

if (findings.length > 0) {
  process.exitCode = 1;
}
