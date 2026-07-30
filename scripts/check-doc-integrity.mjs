#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('..', import.meta.url));
const root = process.env.FRANKENBEAST_DOCS_SCAN_ROOT ?? defaultRoot;
const docsRoot = join(root, 'docs');
const openingMarkerPattern = /^(<{1,})(?:\s.*)?$/u;
const ancestorMarkerPattern = /^(\|{7,})(?:\s.*)?$/u;
const separatorMarkerPattern = /^(={1,})(?:\s.*)?$/u;
const closingMarkerPattern = /^(>{1,})(?:\s.*)?$/u;
const ignoredDirectories = new Set(['generated', 'node_modules', 'vendor']);

async function readConfiguredNarrowMarkerWidths() {
  try {
    const attributes = await readFile(join(root, '.gitattributes'), 'utf8');
    return new Set(
      [...attributes.matchAll(/(?:^|\s)conflict-marker-size=(\d+)(?=\s|$)/gmu)]
        .map((match) => Number(match[1]))
        .filter((width) => width < 3),
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set();
    throw error;
  }
}

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

async function scanFile(path, configuredNarrowMarkerWidths) {
  const source = (await readFile(path, 'utf8')).replace(/^\uFEFF/u, '');
  const findings = [];
  const conflicts = new Map();

  for (const [index, line] of source.split(/\r\n|\r|\n/u).entries()) {
    const openingMatch = openingMarkerPattern.exec(line);
    if (openingMatch) {
      const width = openingMatch[1].length;
      if (width < 3 && !configuredNarrowMarkerWidths.has(width)) continue;
      const finding = { path: toRepoPath(path), line: index + 1, marker: openingMatch[1] };
      if (width >= 7) {
        findings.push(finding);
      } else if (!conflicts.has(width)) {
        conflicts.set(width, {
          width,
          sawSeparator: false,
          findings: [finding],
        });
      }
      continue;
    }

    const ancestorMatch = ancestorMarkerPattern.exec(line);
    if (ancestorMatch) {
      findings.push({ path: toRepoPath(path), line: index + 1, marker: ancestorMatch[1] });
      continue;
    }

    const closingMatch = closingMarkerPattern.exec(line);
    if (closingMatch?.[1].length >= 7) {
      findings.push({ path: toRepoPath(path), line: index + 1, marker: closingMatch[1] });
      conflicts.clear();
      continue;
    }

    const separatorMatch = separatorMarkerPattern.exec(line);
    const separatorConflict = separatorMatch
      ? conflicts.get(separatorMatch[1].length)
      : undefined;
    if (separatorConflict) {
      separatorConflict.sawSeparator = true;
      separatorConflict.findings.push({
        path: toRepoPath(path),
        line: index + 1,
        marker: separatorMatch[1],
      });
      continue;
    }

    const closingConflict = closingMatch
      ? conflicts.get(closingMatch[1].length)
      : undefined;
    if (closingConflict?.sawSeparator) {
      closingConflict.findings.push({
        path: toRepoPath(path),
        line: index + 1,
        marker: closingMatch[1],
      });
      findings.push(...closingConflict.findings);
      conflicts.delete(closingMatch[1].length);
    }
  }

  return findings;
}

const findings = [];
const configuredNarrowMarkerWidths = await readConfiguredNarrowMarkerWidths();
for await (const path of walkMarkdown(docsRoot)) {
  findings.push(...await scanFile(path, configuredNarrowMarkerWidths));
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
