#!/usr/bin/env node
/**
 * Dependabot supply-chain guard.
 *
 * Dependabot should never be allowed to "update" first-party @franken/*
 * workspace packages from the public npm registry. Those versions are controlled
 * by the release workflow, not by registry freshness checks. Every npm group
 * must also explicitly exclude the internal scope so risky grouped updates
 * cannot hide namespace-confusion changes beside unrelated third-party bumps.
 *
 * Run: node scripts/check-dependabot-supply-chain.mjs [--config .github/dependabot.yml]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as yaml from 'js-yaml';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INTERNAL_SCOPE_PATTERN = '@franken/*';

function usage() {
  console.error(
    'Usage: node scripts/check-dependabot-supply-chain.mjs [--config .github/dependabot.yml]',
  );
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

function loadDependabotConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(`Dependabot config not found: ${configPath}`);
  }
  const parsed = yaml.load(readFileSync(configPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Dependabot config must be a YAML object.');
  }
  return parsed;
}

export function validateDependabotSupplyChainConfig(config) {
  const failures = [];
  const updates = asArray(config.updates);
  const npmUpdates = updates.filter(
    (entry) =>
      entry && typeof entry === 'object' && entry['package-ecosystem'] === 'npm',
  );

  if (npmUpdates.length === 0) {
    failures.push(
      'Dependabot must include at least one npm update entry so workspace dependency policy is explicit.',
    );
    return failures;
  }

  for (const update of npmUpdates) {
    const directory =
      typeof update.directory === 'string' ? update.directory : '<missing directory>';
    if (Object.prototype.hasOwnProperty.call(update, 'target-branch')) {
      failures.push(
        `npm Dependabot entry ${directory} must not set target-branch; security updates are evaluated on the default branch and need this internal-scope policy there.`,
      );
    }

    const ignoreRules = asArray(update.ignore);
    const ignoresInternalScope = ignoreRules.some((rule) => {
      if (!rule || typeof rule !== 'object') return false;
      return (
        rule['dependency-name'] === INTERNAL_SCOPE_PATTERN &&
        Object.keys(rule).every((key) => key === 'dependency-name')
      );
    });

    if (!ignoresInternalScope) {
      failures.push(
        `npm Dependabot entry ${directory} must ignore ${INTERNAL_SCOPE_PATTERN} without update-types filters; internal workspace releases are not registry-driven, including security advisories.`,
      );
    }

    for (const [name, group] of Object.entries(update.groups ?? {})) {
      if (!group || typeof group !== 'object') continue;
      if (!hasPattern(group['exclude-patterns'], INTERNAL_SCOPE_PATTERN)) {
        failures.push(
          `npm Dependabot group ${name} in ${directory} must include exclude-patterns: ["${INTERNAL_SCOPE_PATTERN}"] before it can group dependency updates.`,
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

const invokedAsMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
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

  console.log(
    'Dependabot supply-chain guard OK — internal @franken/* updates are excluded from registry-driven dependency PRs.',
  );
}
