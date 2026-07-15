import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

describe('issue #1832 automation failure incident command checklist', () => {
  const checklist = () => read('docs/dr/incident-command-checklist.md');

  it('documents a complete incident command workflow for automation failures', () => {
    const doc = checklist();

    for (const section of [
      '# Incident command checklist for automation failures',
      '## Incident metadata',
      '## 1. Declare command and freeze unsafe paths',
      '## 2. Triage the failure class',
      '## 3. Stabilize and inventory',
      '## 4. Assign roles and recovery lanes',
      '## 5. Decision log template',
      '## 6. Recovery action checklist',
      '## 7. Escalation and communications',
      '## 8. Closure criteria',
      '## Negative checks',
    ]) {
      expect(doc).toContain(section);
    }

    for (const requiredGuidance of [
      'Incident commander',
      'Communication channel',
      'Worker or dispatcher crash loop',
      'Codex review gate stalled or usage-limited',
      'Approval pipeline failed or replayed stale tokens',
      'Backup or restore-preview ambiguity',
      'Cron or monitor produced conflicting action',
      'Corrupt or partial state artifact',
    ]) {
      expect(doc).toContain(requiredGuidance);
    }
  });

  it('makes risky automation failures fail closed until explicit decisions exist', () => {
    const doc = checklist();

    for (const failClosedInstruction of [
      'Freeze automation that can mutate shared state',
      'Run only read-only commands during stabilization',
      'Do not merge on silence or usage-limit text',
      'Treat usage-limit responses, silence, and stale-head clean comments as blockers',
      'Keep restore commands disabled until all drift items are classified',
      'requires explicit decision-log rows before merges, force-pushes, restore commands, approval replays, or broad worker respawns',
    ]) {
      expect(doc).toContain(failClosedInstruction);
    }

    for (const negativeCase of [
      'A merge, force-push, branch deletion, restore command, approval replay, broad unblock, or broad worker respawn was executed.',
      'A second worker or monitor was started while a live owner already existed for the same issue/PR/card.',
      'A stale Codex clean or usage-limit response was treated as a current-head clean gate.',
      'A corrupt, partial, or unclassified backup artifact was restored or merged into live state.',
    ]) {
      expect(doc).toContain(negativeCase);
    }

    expect(doc).not.toContain('run the restore command against production');
    expect(doc).not.toContain('merge when silent');
  });

  it('links the incident checklist from disaster-recovery documentation', () => {
    const restorePreview = read('docs/dr/restore-preview.md');

    expect(restorePreview).toContain('docs/dr/incident-command-checklist.md');
    expect(restorePreview).toContain('Automation failure incident command');
    expect(restorePreview).toContain('freezes unsafe mutation paths');
  });
});
