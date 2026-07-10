#!/usr/bin/env node
/**
 * Fail CI only when `npm outdated` reports a direct dependency whose declared
 * range permits a newer major than the version currently locked/installed.
 *
 * Usage:
 *   node scripts/check-major-outdated.mjs
 *   node scripts/check-major-outdated.mjs --input path/to/npm-outdated.json
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function usage() {
  console.error('Usage: node scripts/check-major-outdated.mjs [--input npm-outdated.json]');
}

function parseArgs(argv) {
  if (argv.length === 0) return { input: null };
  if (argv.length === 2 && argv[0] === '--input') return { input: argv[1] };
  usage();
  process.exit(2);
}

function readOutdatedJson(input) {
  if (input) {
    return readFileSync(input, 'utf8');
  }

  try {
    return execFileSync('npm', ['outdated', '--json'], {
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
  return Object.entries(report)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([name, value]) => ({ name, ...value }));
}

export function findMajorOutdated(report) {
  return toRows(report)
    .map((entry) => {
      const currentMajor = parseMajor(entry.current);
      const wantedMajor = parseMajor(entry.wanted);
      return {
        name: entry.name,
        current: entry.current,
        wanted: entry.wanted,
        latest: entry.latest,
        location: entry.location,
        currentMajor,
        wantedMajor,
      };
    })
    .filter((entry) => entry.currentMajor !== null && entry.wantedMajor !== null && entry.wantedMajor > entry.currentMajor)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const { input } = parseArgs(process.argv.slice(2));
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

const majorGaps = findMajorOutdated(parsed);
if (majorGaps.length === 0) {
  console.log('dependency freshness OK — no direct dependencies are behind an allowed major release');
  process.exit(0);
}

console.error(`FAIL: ${majorGaps.length} direct dependenc${majorGaps.length === 1 ? 'y is' : 'ies are'} behind a newer major permitted by package.json:`);
for (const gap of majorGaps) {
  const where = gap.location ? ` (${gap.location})` : '';
  console.error(`- ${gap.name}${where}: current ${gap.current}, wanted ${gap.wanted ?? 'unknown'}, latest ${gap.latest}`);
}
console.error('\nUpdate or intentionally pin these dependencies before merging.');
process.exit(1);
