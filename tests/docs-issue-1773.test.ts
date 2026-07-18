import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const manifestPath = 'docs/onboarding/repository-ownership.manifest.json';
const guidePath = 'docs/onboarding/repository-ownership.md';

type OwnershipEntry = {
  id: string;
  name: string;
  paths: string[];
  primaryOwner: string;
  escalationOwner: string;
  responsibilities: string[];
  verification: string[];
  handoffNotes: string[];
};

type OwnershipManifest = {
  schemaVersion: number;
  defaultOwner: string;
  unknownPathPolicy: string;
  entries: OwnershipEntry[];
};

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function readManifest(): OwnershipManifest {
  return JSON.parse(readText(manifestPath)) as OwnershipManifest;
}

describe('issue #1773 repository ownership manifest', () => {
  it('adds a structured, LLM-friendly repository ownership manifest with deterministic owner fields', () => {
    const manifest = readManifest();

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.defaultOwner).toBe('core-maintainers');
    expect(manifest.unknownPathPolicy).toContain('docs/CONTRACT_MATRIX.md');
    expect(manifest.entries.length).toBeGreaterThanOrEqual(8);

    for (const entry of manifest.entries) {
      expect(entry.id).toMatch(/^[a-z0-9-]+$/);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.primaryOwner.length).toBeGreaterThan(0);
      expect(entry.escalationOwner.length).toBeGreaterThan(0);
      expect(entry.paths.length).toBeGreaterThan(0);
      expect(entry.responsibilities.length).toBeGreaterThan(0);
      expect(entry.verification.length).toBeGreaterThan(0);
      expect(entry.handoffNotes.length).toBeGreaterThan(0);
    }
  });

  it('covers the current package inventory and onboarding docs without overlapping package owners', () => {
    const manifest = readManifest();
    const allPaths = manifest.entries.flatMap((entry) => entry.paths);

    for (const requiredPath of [
      'packages/franken-types/**',
      'packages/franken-brain/**',
      'packages/franken-planner/**',
      'packages/franken-observer/**',
      'packages/franken-critique/**',
      'packages/franken-governor/**',
      'packages/franken-web/**',
      'packages/franken-orchestrator/**',
      'packages/franken-mcp-suite/**',
      'packages/live-bench/**',
      'docs/onboarding/**',
      'ONBOARDING.md',
    ]) {
      expect(allPaths).toContain(requiredPath);
    }

    const packagePaths = allPaths.filter((path) => path.startsWith('packages/'));
    expect(new Set(packagePaths).size).toBe(packagePaths.length);
  });

  it('documents use, edge cases, and the onboarding entrypoint for operators and coordinator handoffs', () => {
    const guide = readText(guidePath);
    const onboarding = readText('ONBOARDING.md');

    for (const requiredText of [
      '# Repository ownership manifest',
      'docs/onboarding/repository-ownership.manifest.json',
      'Unknown or cross-cutting paths',
      'Coordinator/worker handoff',
      'Do not guess an owner from package names alone.',
      'If a change spans multiple owners, list every touched manifest entry',
    ]) {
      expect(guide).toContain(requiredText);
    }

    expect(onboarding).toContain('[repository ownership manifest](docs/onboarding/repository-ownership.md)');
    expect(onboarding).toContain('before assigning repository-wide or cross-package work');
  });
});
