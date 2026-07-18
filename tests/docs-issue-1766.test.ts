import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const roleMapPath = 'docs/onboarding/agent-role-responsibility-map.manifest.json';
const roleGuidePath = 'docs/onboarding/agent-role-responsibility-map.md';
const ownershipManifestPath = 'docs/onboarding/repository-ownership.manifest.json';

type OwnershipManifest = {
  entries: Array<{ id: string; primaryOwner: string; escalationOwner: string }>;
};

type RoleMapping = {
  roleId: string;
  roleName: string;
  whenToUse: string;
  owns: string[];
  repositoryResponsibilities: Array<{ ownershipEntryId: string; reason: string }>;
  mustNotOwn: string[];
  handoffNotes: string[];
  verification: string[];
};

type AgentRoleMap = {
  schemaVersion: number;
  ownershipManifest: string;
  handoffRequiredFields: string[];
  toolManifests: Record<string, string[]>;
  roleMappings: RoleMapping[];
};

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('issue #1766 agent role responsibility map', () => {
  it('adds a deterministic role map that references the repository ownership manifest', () => {
    const roleMap = readJson<AgentRoleMap>(roleMapPath);
    const ownership = readJson<OwnershipManifest>(ownershipManifestPath);
    const ownershipIds = new Set(ownership.entries.map((entry) => entry.id));

    expect(roleMap.schemaVersion).toBe(1);
    expect(roleMap.ownershipManifest).toBe(ownershipManifestPath);
    expect(roleMap.roleMappings.map((role) => role.roleId)).toEqual([
      'pm-shard',
      'issue-worker',
      'doctor-recovery',
      'reviewer',
      'docs-onboarding-worker',
    ]);

    for (const role of roleMap.roleMappings) {
      expect(role.roleId).toMatch(/^[a-z0-9-]+$/);
      expect(role.roleName.length).toBeGreaterThan(0);
      expect(role.whenToUse.length).toBeGreaterThan(0);
      expect(role.owns.length).toBeGreaterThan(0);
      expect(role.repositoryResponsibilities.length).toBeGreaterThan(0);
      expect(role.mustNotOwn.length).toBeGreaterThan(0);
      expect(role.handoffNotes.length).toBeGreaterThan(0);
      expect(role.verification.length).toBeGreaterThan(0);

      for (const responsibility of role.repositoryResponsibilities) {
        expect(ownershipIds.has(responsibility.ownershipEntryId)).toBe(true);
        expect(responsibility.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('requires role handoffs to carry owner, escalation, verification, and notes fields', () => {
    const roleMap = readJson<AgentRoleMap>(roleMapPath);

    expect(roleMap.handoffRequiredFields).toEqual([
      'agentRole',
      'ownershipEntries',
      'primaryOwners',
      'escalationOwner',
      'verification',
      'handoffNotes',
    ]);

    const issueWorker = roleMap.roleMappings.find((role) => role.roleId === 'issue-worker');
    expect(issueWorker).toBeDefined();
    expect(issueWorker?.verification).toContain('npm run test:root -- tests/docs-issue-1766.test.ts');
    expect(issueWorker?.mustNotOwn.join(' ')).toContain('Adjacent open issues');
  });

  it('defines least-privilege tool manifests for runtime roles', () => {
    const roleMap = readJson<AgentRoleMap>(roleMapPath);

    expect(Object.keys(roleMap.toolManifests).sort()).toEqual([
      'coding',
      'docs',
      'doctor',
      'review',
      'ticket-manager',
      'triage',
    ]);
    expect(roleMap.toolManifests.coding).toEqual(expect.arrayContaining(['patch', 'terminal.background']));
    expect(roleMap.toolManifests['ticket-manager']).toEqual(expect.arrayContaining(['read_file', 'search_files', 'github.read', 'github.comment']));
    expect(roleMap.toolManifests['ticket-manager']).not.toContain('patch');
    expect(roleMap.toolManifests['ticket-manager']).not.toContain('terminal.background');
  });

  it('documents use, onboarding entrypoint, and negative edge cases for ambiguous ownership', () => {
    const guide = readText(roleGuidePath);
    const onboarding = readText('ONBOARDING.md');

    for (const requiredText of [
      '# Agent role responsibility map',
      'docs/onboarding/agent-role-responsibility-map.manifest.json',
      'Agent role: issue-worker',
      'Do not let the first matching path hide additional owners.',
      'Do not let the agent role override repository ownership.',
      'Do not respawn a worker or create a duplicate branch until live Kanban, GitHub, and worktree evidence proves there is no active owner.',
      'Keep role ids stable',
    ]) {
      expect(guide).toContain(requiredText);
    }

    expect(onboarding).toContain('[agent role responsibility map](docs/onboarding/agent-role-responsibility-map.md)');
    expect(onboarding).toContain('required handoff fields');
  });
});
