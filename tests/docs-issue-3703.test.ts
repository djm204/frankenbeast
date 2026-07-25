import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const readDoc = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('issue #3703 governed Hive Brain dispatch documentation', () => {
  it('documents the shipped shared dispatch and approval boundary', () => {
    const architecture = readDoc('docs/ARCHITECTURE.md');
    const rampUp = readDoc('docs/onboarding/RAMP_UP.md');
    const orchestratorReadme = readDoc('packages/franken-orchestrator/README.md');
    const adr = readDoc('docs/adr/041-hive-brain-command-center.md');

    for (const doc of [architecture, rampUp, orchestratorReadme, adr]) {
      expect(doc).toContain('BrainConversationSessionStore');
      expect(doc).toContain('BeastDispatchService');
      expect(doc).toContain('pending_approval');
    }
    expect(adr).toContain('#3703 is implemented');
    expect(orchestratorReadme).toMatch(/No existing REST\s+or WebSocket chat API contract changed/);
  });
});
