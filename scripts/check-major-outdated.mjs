#!/usr/bin/env node
/**
 * Fail CI when `npm outdated` reports direct dependencies whose latest release
 * is on a newer major than the version currently locked/installed, excluding
 * repo-approved baseline gaps that predate the guard.
 *
 * Usage:
 *   node scripts/check-major-outdated.mjs
 *   node scripts/check-major-outdated.mjs --input path/to/npm-outdated.json
 *   node scripts/check-major-outdated.mjs --baseline path/to/baseline.json
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultBaseline = resolve(repoRoot, 'scripts/major-outdated-baseline.json');

function usage() {
  console.error('Usage: node scripts/check-major-outdated.mjs [--input npm-outdated.json] [--baseline baseline.json]');
}

function parseArgs(argv) {
  const args = { input: null, baseline: defaultBaseline };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--baseline' && argv[i + 1]) {
      args.baseline = argv[i + 1];
      i += 1;
      continue;
    }
    usage();
    process.exit(2);
  }
  return args;
}

function readOutdatedJson(input) {
  if (input) {
    return readFileSync(input, 'utf8');
  }

  try {
    return execFileSync('npm', ['outdated', '--json', '--workspaces', '--include-workspace-root'], {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 1) {
      return typeof error.stdout === 'string' ? error.stdout : '';
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Unable to run npm outdated: ${message}`);
    if (typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim()) {
      console.error(error.stderr.trim());
    }
    process.exit(2);
  }
}

function parseMajor(version) {
  if (typeof version !== 'string') return null;
  const match = version.trim().match(/^(?:npm:)?v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function toRows(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return [];
  return Object.entries(report).flatMap(([name, value]) => {
    if (Array.isArray(value)) {
      return value
        .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => ({ name, ...entry }));
    }
    if (value && typeof value === 'object') {
      return [{ name, ...value }];
    }
    return [];
  });
}

function hasNpmError(report) {
  return Boolean(report && typeof report === 'object' && !Array.isArray(report) && 'error' in report);
}

function normalizeIdentity(identity) {
  if (typeof identity !== 'string' || !identity.trim()) return '<root>';
  const normalized = identity.replaceAll('\\\\', '/');
  const root = repoRoot.replaceAll('\\\\', '/');
  return normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : normalized;
}

function baselineKey(entry) {
  return `${entry.name}:${normalizeIdentity(entry.dependent ?? '<root>')}:${normalizeIdentity(entry.location ?? '<unknown-location>')}:${entry.currentMajor}->${entry.latestMajor}`;
}

function readBaseline(path) {
  if (!path || !existsSync(path)) return new Set();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`Unable to parse major-outdated baseline ${path}.`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  if (!Array.isArray(parsed)) {
    console.error(`Major-outdated baseline ${path} must be a JSON array.`);
    process.exit(2);
  }
  return new Set(
    parsed.map((entry) => {
      if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string') {
        console.error(`Invalid major-outdated baseline entry: ${JSON.stringify(entry)}`);
        process.exit(2);
      }
      const currentMajor = Number.isInteger(entry.currentMajor) ? entry.currentMajor : parseMajor(entry.current);
      const latestMajor = Number.isInteger(entry.latestMajor) ? entry.latestMajor : parseMajor(entry.latest);
      if (currentMajor === null || latestMajor === null) {
        console.error(`Invalid major-outdated baseline versions for ${entry.name}.`);
        process.exit(2);
      }
      const dependent = entry.dependent ?? '<root>';
      const location = entry.location ?? '<unknown-location>';
      if (typeof dependent !== 'string' || !dependent.trim() || typeof location !== 'string' || !location.trim()) {
        console.error(`Invalid major-outdated baseline identity for ${entry.name}.`);
        process.exit(2);
      }
      return baselineKey({ name: entry.name, dependent, location, currentMajor, latestMajor });
    }),
  );
}

export function findMajorOutdated(report) {
  return toRows(report)
    .map((entry) => {
      const currentMajor = parseMajor(entry.current);
      const latestMajor = parseMajor(entry.latest);
      return {
        name: entry.name,
        current: entry.current,
        wanted: entry.wanted,
        latest: entry.latest,
        location: entry.location,
        dependent: entry.dependent,
        currentMajor,
        latestMajor,
      };
    })
    .filter((entry) => entry.currentMajor !== null && entry.latestMajor !== null && entry.latestMajor > entry.currentMajor)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const { input, baseline } = parseArgs(process.argv.slice(2));
const raw = readOutdatedJson(input).trim();
if (!raw) {
  console.log('dependency freshness OK — npm outdated reported no outdated dependencies');
  process.exit(0);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (error) {
  console.error('npm outdated did not produce valid JSON.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

if (hasNpmError(parsed)) {
  const detail = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
  console.error(`npm outdated reported an error instead of dependency data: ${detail}`);
  process.exit(2);
}

const baselineKeys = readBaseline(baseline);
const majorGaps = findMajorOutdated(parsed);
const unapprovedGaps = majorGaps.filter((entry) => !baselineKeys.has(baselineKey(entry)));
if (unapprovedGaps.length === 0) {
  const suffix = majorGaps.length > 0 ? ` (${majorGaps.length} baseline-approved major gap${majorGaps.length === 1 ? '' : 's'} unchanged)` : '';
  console.log(`dependency freshness OK — no unapproved direct dependencies are behind the latest major release${suffix}`);
  process.exit(0);
}

console.error(`FAIL: ${unapprovedGaps.length} direct dependenc${unapprovedGaps.length === 1 ? 'y is' : 'ies are'} behind the latest major release without a baseline entry:`);
for (const gap of unapprovedGaps) {
  const where = [gap.dependent, gap.location].filter(Boolean).join(' at ');
  const suffix = where ? ` (${where})` : '';
  console.error(`- ${gap.name}${suffix}: current ${gap.current}, wanted ${gap.wanted ?? 'unknown'}, latest ${gap.latest}`);
}
console.error('\nUpdate these dependencies or add an intentional baseline entry before merging.');
process.exit(1);
