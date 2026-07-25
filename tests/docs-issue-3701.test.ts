import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const readDoc = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('issue #3701 BrainConversation documentation', () => {
  it('documents the shipped entity, persistence, and compatibility boundary', () => {
    const architecture = readDoc('docs/ARCHITECTURE.md');
    const rampUp = readDoc('docs/onboarding/RAMP_UP.md');
    const brainReadme = readDoc('packages/franken-brain/README.md');
    const orchestratorReadme = readDoc('packages/franken-orchestrator/README.md');
    const adr = readDoc('docs/adr/041-hive-brain-command-center.md');

    for (const doc of [architecture, rampUp, brainReadme]) {
      expect(doc).toContain('SqliteBrainConversationRepository');
      expect(doc).toContain('forWorkspaceHive');
    }
    expect(orchestratorReadme).toContain('BrainConversationSessionStore');
    expect(adr).toContain('#3701 is implemented');
  });
});
