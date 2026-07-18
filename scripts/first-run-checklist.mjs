#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PERSONAS = new Set(['operator', 'coding-agent', 'contributor']);

function usage() {
  console.info(`Usage: npm run first-run:checklist -- [--persona operator|coding-agent|contributor] [--json] [--root <path>]

Generates a deterministic first-run checklist tailored to the selected persona.
The checklist is guidance only: it does not mutate files, install dependencies, or contact services.

Examples:
  npm run first-run:checklist -- --persona operator
  npm --silent run first-run:checklist -- --persona coding-agent --json

Human output is Markdown grouped by phase. JSON output is { persona, root, items, docs, nextAction }.`);
}

function parseArgs(argv) {
  const options = {
    persona: 'contributor',
    json: false,
    root: process.cwd(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--persona') {
      const value = argv[i + 1];
      if (!value) throw new Error('--persona requires operator, coding-agent, or contributor');
      options.persona = value;
      i += 1;
      continue;
    }
    if (arg?.startsWith('--persona=')) {
      const value = arg.slice('--persona='.length);
      if (!value) throw new Error('--persona requires operator, coding-agent, or contributor');
      options.persona = value;
      continue;
    }
    if (arg === '--root') {
      const value = argv[i + 1];
      if (!value) throw new Error('--root requires a path');
      options.root = value;
      i += 1;
      continue;
    }
    if (arg?.startsWith('--root=')) {
      const value = arg.slice('--root='.length);
      if (!value) throw new Error('--root requires a path');
      options.root = value;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!PERSONAS.has(options.persona)) {
    throw new Error(`Unknown persona: ${options.persona}. Expected one of: ${[...PERSONAS].join(', ')}`);
  }

  return options;
}

function readManifest(root) {
  try {
    return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

function requireFrankenbeastRoot(root) {
  const manifest = readManifest(root);
  if (manifest?.name !== 'frankenbeast') {
    throw new Error(`${root} is not a Frankenbeast checkout; run from the repository root or pass --root <path>`);
  }
  return manifest;
}

function item(id, phase, title, detail, command, docs, personas = [...PERSONAS], required = true) {
  return { id, phase, title, detail, command, docs, personas, required };
}

function buildCatalog(manifest) {
  const npmPin = typeof manifest.packageManager === 'string' ? manifest.packageManager : 'the repository npm pin';
  return [
    item(
      'toolchain-node-npm',
      'Prerequisites',
      'Confirm the supported Node.js and npm toolchain',
      `Use Node.js >=22.13.0 <23 or >=24.0.0 <26 and ${npmPin}; engine-strict makes unsupported versions fail early.`,
      'node --version && npm --version',
      ['ONBOARDING.md#prerequisites', '.nvmrc', 'package.json'],
    ),
    item(
      'bootstrap-default',
      'Bootstrap',
      'Run the canonical first-run bootstrap path',
      'Creates .env from .env.example when needed, validates defaults, installs dependencies, and skips optional Docker services by default.',
      'npm run bootstrap -- --no-docker',
      ['ONBOARDING.md#bootstrap', 'docs/guides/quickstart.md'],
    ),
    item(
      'worker-preflight',
      'Worker readiness',
      'Generate machine-readable worker preflight evidence before coding',
      'Verifies git, gh, jq, GitHub auth, project git identity, Frankenbeast root, and clean worktree status.',
      'npm --silent run new-worker:preflight -- --json',
      ['ONBOARDING.md#bootstrap'],
      ['coding-agent'],
    ),
    item(
      'operator-secrets',
      'Runtime configuration',
      'Choose secret storage and fill only needed local runtime values',
      'Decide local encrypted file, OS keychain, 1Password, or Bitwarden before init; keep Beast operator tokens server-side.',
      '$EDITOR .env',
      ['ONBOARDING.md#bootstrap', 'ONBOARDING.md#beast-controls-in-the-dashboard'],
      ['operator', 'contributor'],
    ),
    item(
      'optional-services',
      'Optional services',
      'Start optional local infrastructure only when needed',
      'Docker services are only needed for local ChromaDB, Grafana, and Tempo workflows; set Grafana credentials before starting them.',
      'npm run bootstrap -- --services',
      ['ONBOARDING.md#optional-services', 'docs/guides/quickstart.md'],
      ['operator'],
      false,
    ),
    item(
      'standard-verification',
      'Verification',
      'Run the standard local verification gates',
      'Build, typecheck, and tests catch drift after bootstrap; use the test command decision tree when a narrower gate is enough.',
      'npm run build && npm run typecheck && npm test',
      ['ONBOARDING.md#bootstrap', 'docs/onboarding/test-command-decision-tree.md'],
    ),
    item(
      'architecture-reading-path',
      'Orientation',
      'Read current architecture docs before changing package boundaries',
      'Start with current implementation docs and only then branch into historical plans or ADRs.',
      undefined,
      ['ONBOARDING.md#architecture-reading-path', 'docs/RAMP_UP.md', 'docs/ARCHITECTURE.md'],
      ['coding-agent', 'contributor'],
    ),
    item(
      'pr-etiquette',
      'Contribution workflow',
      'Review coding-agent PR etiquette before opening or updating PRs',
      'Keeps one-issue/one-PR scope, current-head CI/Codex evidence, and blocked handoff fields consistent.',
      undefined,
      ['docs/onboarding/coding-agent-pr-etiquette.md'],
      ['coding-agent'],
    ),
    item(
      'first-pr-runbook',
      'Contribution workflow',
      'Use the first-PR agent runbook for small one-issue PRs',
      'Walks a fresh coding agent through duplicate checks, isolated worktree setup, issue-scoped verification, PR creation, Codex review, and merge handoff.',
      undefined,
      ['docs/onboarding/first-pr-agent-runbook.md', 'docs/onboarding/repository-ownership.manifest.json'],
      ['coding-agent'],
    ),
  ];
}

function buildChecklist(options) {
  const root = resolve(options.root);
  const manifest = requireFrankenbeastRoot(root);
  const items = buildCatalog(manifest).filter((entry) => entry.personas.includes(options.persona));
  return {
    persona: options.persona,
    root,
    items,
    docs: ['ONBOARDING.md', 'docs/onboarding/persona-quickstart-tracks.md', 'docs/guides/quickstart.md', 'docs/RAMP_UP.md'],
    nextAction: options.persona === 'coding-agent'
      ? 'Run the worker preflight JSON command, attach it to the issue/PR handoff, then choose the narrowest verification gate for your change.'
      : 'Work through required items in phase order, then run optional items only when the matching workflow needs them.',
  };
}

function renderMarkdown(checklist) {
  const lines = [
    `# Frankenbeast first-run checklist (${checklist.persona})`,
    '',
    `Repository root: \`${checklist.root}\``,
    '',
    'This generated checklist is deterministic guidance. It does not mutate files or run setup commands for you.',
    '',
  ];
  const phases = [...new Set(checklist.items.map((entry) => entry.phase))];
  for (const phase of phases) {
    lines.push(`## ${phase}`);
    for (const entry of checklist.items.filter((candidate) => candidate.phase === phase)) {
      const required = entry.required ? 'required' : 'optional';
      lines.push(`- [ ] **${entry.title}** (${entry.id}, ${required})`);
      lines.push(`  - Why: ${entry.detail}`);
      if (entry.command) lines.push(`  - Command: \`${entry.command}\``);
      lines.push(`  - Docs: ${entry.docs.map((doc) => `\`${doc}\``).join(', ')}`);
    }
    lines.push('');
  }
  lines.push(`Next action: ${checklist.nextAction}`);
  return lines.join('\n');
}

try {
  const options = parseArgs(process.argv.slice(2));
  const checklist = buildChecklist(options);
  console.info(options.json ? JSON.stringify(checklist, null, 2) : renderMarkdown(checklist));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`first-run checklist failed: ${message}`);
  process.exit(2);
}
