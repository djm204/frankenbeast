#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const repoRoot = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'coverage', '.turbo']);
const sourceFiles = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) {
      continue;
    }

    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      walk(path);
      continue;
    }

    if (/\.tsx?$/.test(entry)) {
      sourceFiles.push(path);
    }
  }
}

function isTestPath(relativePath) {
  const parts = relativePath.split('/');
  return parts.some((part) => ['test', 'tests', '__tests__'].includes(part)) || /\.(test|spec)\.tsx?$/.test(relativePath);
}

function packageName(relativePath) {
  const parts = relativePath.split('/');
  return parts[0] === 'packages' && parts[1] ? parts[1] : '(root)';
}

function countAnyNodes(path) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  let count = 0;
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return count;
}

function sortByCountThenPath(left, right) {
  return right.count - left.count || left.path.localeCompare(right.path);
}

walk(repoRoot);

const rows = sourceFiles
  .map((file) => {
    const path = relative(repoRoot, file).replaceAll('\\\\', '/');
    const count = countAnyNodes(file);
    const scope = isTestPath(path) ? 'test' : 'production';
    return { path, package: packageName(path), scope, count };
  })
  .filter((row) => row.count > 0)
  .sort(sortByCountThenPath);

const packages = new Map();
for (const row of rows) {
  const bucket = packages.get(row.package) ?? {
    package: row.package,
    files: 0,
    occurrences: 0,
    productionFiles: 0,
    productionOccurrences: 0,
    testFiles: 0,
    testOccurrences: 0,
  };

  bucket.files += 1;
  bucket.occurrences += row.count;

  if (row.scope === 'production') {
    bucket.productionFiles += 1;
    bucket.productionOccurrences += row.count;
  } else {
    bucket.testFiles += 1;
    bucket.testOccurrences += row.count;
  }

  packages.set(row.package, bucket);
}

const summary = {
  generatedAt: new Date().toISOString(),
  repository: repoRoot,
  ignoredDirs: [...ignoredDirs].sort(),
  totalFiles: rows.length,
  totalOccurrences: rows.reduce((total, row) => total + row.count, 0),
  productionOccurrences: rows
    .filter((row) => row.scope === 'production')
    .reduce((total, row) => total + row.count, 0),
  testOccurrences: rows
    .filter((row) => row.scope === 'test')
    .reduce((total, row) => total + row.count, 0),
  packages: [...packages.values()].sort((left, right) => right.occurrences - left.occurrences || left.package.localeCompare(right.package)),
  files: rows,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`# Explicit any audit\n`);
  console.log(`Generated: ${summary.generatedAt}`);
  console.log(`Ignored directories: ${summary.ignoredDirs.map((dir) => `\`${dir}\``).join(', ')}`);
  console.log(`Total: ${summary.totalOccurrences} explicit \`any\` type nodes across ${summary.totalFiles} files`);
  console.log(`Production: ${summary.productionOccurrences}`);
  console.log(`Tests: ${summary.testOccurrences}\n`);

  console.log('| Package | Files | Occurrences | Production | Tests |');
  console.log('| --- | ---: | ---: | ---: | ---: |');
  for (const bucket of summary.packages) {
    console.log(`| \`${bucket.package}\` | ${bucket.files} | ${bucket.occurrences} | ${bucket.productionOccurrences} | ${bucket.testOccurrences} |`);
  }

  console.log('\n## Top files\n');
  console.log('| Occurrences | Scope | File |');
  console.log('| ---: | --- | --- |');
  for (const row of summary.files.slice(0, 25)) {
    console.log(`| ${row.count} | ${row.scope} | \`${row.path}\` |`);
  }
}

if (!existsSync(join(repoRoot, 'package.json'))) {
  process.exitCode = 1;
}
