#!/usr/bin/env node
/**
 * Dependabot supply-chain guard.
 *
 * Dependabot should never be allowed to "update" first-party @franken/*
 * workspace packages from the public npm registry. Those versions are controlled
 * by the release workflow, not by registry freshness checks. Broad npm groups
 * must also explicitly exclude the internal scope so a risky catch-all update
 * cannot hide namespace-confusion changes beside unrelated third-party bumps.
 *
 * Run: node scripts/check-dependabot-supply-chain.mjs [--config .github/dependabot.yml]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INTERNAL_SCOPE_PATTERN = '@franken/*';

function usage() {
  console.error('Usage: node scripts/check-dependabot-supply-chain.mjs [--config .github/dependabot.yml]');
}

function parseArgs(argv) {
  const args = { config: resolve(repoRoot, '.github/dependabot.yml') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config' && argv[i + 1]) {
      args.config = resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    usage();
    process.exit(2);
  }
  return args;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasPattern(patterns, expected) {
  return asArray(patterns).some((pattern) => pattern === expected);
}

function unquote(value) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function parseDependabotConfig(raw) {
  const updates = [];
  let update = null;
  let groupName = null;
  let ignoreRule = null;
  let mode = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;

    const updateMatch = line.match(/^\s{2}-\s+package-ecosystem:\s+(.+)$/);
    if (updateMatch) {
      update = { 'package-ecosystem': unquote(updateMatch[1]), groups: {}, ignore: [] };
      updates.push(update);
      groupName = null;
      ignoreRule = null;
      mode = null;
      continue;
    }
    if (!update) continue;

    const directoryMatch = line.match(/^\s{4}directory:\s+(.+)$/);
    if (directoryMatch) {
      update.directory = unquote(directoryMatch[1]);
      continue;
    }

    if (/^\s{4}groups:\s*$/.test(line)) {
      mode = 'groups';
      groupName = null;
      continue;
    }
    if (/^\s{4}ignore:\s*$/.test(line)) {
      mode = 'ignore';
      groupName = null;
      continue;
    }

    const groupMatch = line.match(/^ {6}([^\s][^:]*):\s*$/);
    if (groupMatch && mode === 'groups') {
      groupName = unquote(groupMatch[1]);
      update.groups[groupName] = update.groups[groupName] ?? {};
      continue;
    }
    if (line.match(/^\s{8}patterns:\s*$/) && mode === 'groups' && groupName) {
      mode = 'group-patterns';
      update.groups[groupName].patterns = update.groups[groupName].patterns ?? [];
      continue;
    }
    if (line.match(/^\s{8}exclude-patterns:\s*$/) && groupName) {
      mode = 'group-exclude-patterns';
      update.groups[groupName]['exclude-patterns'] = update.groups[groupName]['exclude-patterns'] ?? [];
      continue;
    }

    const ignoreMatch = line.match(/^\s{6}-\s+dependency-name:\s+(.+)$/);
    if (ignoreMatch && (mode === 'ignore' || mode === 'ignore-update-types')) {
      ignoreRule = { 'dependency-name': unquote(ignoreMatch[1]), 'update-types': [] };
      update.ignore.push(ignoreRule);
      mode = 'ignore';
      continue;
    }
    if (line.match(/^\s{8}update-types:\s*$/) && ignoreRule) {
      mode = 'ignore-update-types';
      continue;
    }

    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (!listMatch) continue;
    const value = unquote(listMatch[1]);
    if (mode === 'group-patterns' && groupName) {
      update.groups[groupName].patterns.push(value);
    } else if (mode === 'group-exclude-patterns' && groupName) {
      update.groups[groupName]['exclude-patterns'].push(value);
    } else if (mode === 'ignore-update-types' && ignoreRule) {
      ignoreRule['update-types'].push(value);
    }
  }

  return { updates };
}

function loadDependabotConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(`Dependabot config not found: ${configPath}`);
  }
  return parseDependabotConfig(readFileSync(configPath, 'utf8'));
}

export function validateDependabotSupplyChainConfig(config) {
  const failures = [];
  const updates = asArray(config.updates);
  const npmUpdates = updates.filter((entry) => entry && typeof entry === 'object' && entry['package-ecosystem'] === 'npm');

  if (npmUpdates.length === 0) {
    failures.push('Dependabot must include at least one npm update entry so workspace dependency policy is explicit.');
    return failures;
  }

  for (const update of npmUpdates) {
    const directory = typeof update.directory === 'string' ? update.directory : '<missing directory>';
    const ignoreRules = asArray(update.ignore);
    const ignoresInternalScope = ignoreRules.some((rule) => {
      if (!rule || typeof rule !== 'object') return false;
      return rule['dependency-name'] === INTERNAL_SCOPE_PATTERN && hasPattern(rule['update-types'], 'version-update:semver-major') && hasPattern(rule['update-types'], 'version-update:semver-minor') && hasPattern(rule['update-types'], 'version-update:semver-patch');
    });

    if (!ignoresInternalScope) {
      failures.push(
        `npm Dependabot entry ${directory} must ignore ${INTERNAL_SCOPE_PATTERN} for major/minor/patch updates; internal workspace releases are not registry-driven.`,
      );
    }

    for (const [name, group] of Object.entries(update.groups ?? {})) {
      if (!group || typeof group !== 'object') continue;
      if (!hasPattern(group.patterns, '*')) continue;
      if (!hasPattern(group['exclude-patterns'], INTERNAL_SCOPE_PATTERN)) {
        failures.push(
          `npm Dependabot group ${name} in ${directory} uses catch-all pattern "*" without exclude-patterns: ["${INTERNAL_SCOPE_PATTERN}"].`,
        );
      }
    }
  }

  return failures;
}

export function checkDependabotSupplyChainConfig(configPath) {
  const config = loadDependabotConfig(configPath);
  return validateDependabotSupplyChainConfig(config);
}

const invokedAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsMain) {
  const { config } = parseArgs(process.argv.slice(2));
  let failures;
  try {
    failures = checkDependabotSupplyChainConfig(config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  if (failures.length > 0) {
    console.error('Dependabot supply-chain guard failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Dependabot supply-chain guard OK — internal @franken/* updates are excluded from registry-driven dependency PRs.');
}
