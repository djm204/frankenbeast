#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const scannedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const scanRoots = ['packages', 'scripts'];
const ignoredPathParts = new Set([
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

function extensionOf(path) {
  const match = /\.[^.]+$/.exec(path);
  return match?.[0] ?? '';
}

function shouldScan(path) {
  const rel = relative(root, path);
  const parts = rel.split('/');
  if (parts.some((part) => ignoredPathParts.has(part))) {
    return false;
  }
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) {
    return false;
  }
  return scannedExtensions.has(extensionOf(path));
}

function isAllowedLocalPlaintext(urlText) {
  try {
    const parsed = new URL(urlText);
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return parsed.protocol === 'http:' && (
      host === 'localhost'
      || host === '::1'
      || host === '0:0:0:0:0:0:0:1'
      || host === '0.0.0.0'
      || host === '::'
      || host === '127.0.0.1'
      || host.startsWith('127.')
    );
  } catch {
    return false;
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
    if (entry.isFile() && shouldScan(fullPath)) {
      yield fullPath;
    }
  }
}

const findings = [];
for (const scanRoot of scanRoots) {
  for await (const file of walk(join(root, scanRoot))) {
    const content = await readFile(file, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
        continue;
      }
      for (const match of line.matchAll(/http:\/\/[^\s'"`)>}]+/g)) {
        const url = match[0];
        if (url.includes('${')) {
          continue;
        }
        if (!isAllowedLocalPlaintext(url)) {
          findings.push(`${relative(root, file)}:${index + 1}: ${url}`);
        }
      }
    }
  }
}

if (findings.length > 0) {
  console.error('Plain HTTP URLs are only allowed for loopback-only local development targets. Use HTTPS/WSS for non-loopback endpoints.');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('No non-loopback plain HTTP URLs found in production JavaScript/TypeScript sources.');
