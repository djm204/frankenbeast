import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const readDoc = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const ADR_PATH = 'docs/adr/039-hive-brain-command-center.md';

describe('issue #3700 Hive Brain central-command chat decision', () => {
  it('answers the transport, entity, registry, compatibility, and dispatch questions', () => {
    const adr = readDoc(ADR_PATH);

    for (const decision of [
      '### 1. Extend the existing chat transport',
      '### 2. `BrainConversation` is durable conversation state, not a brain',
      '### 3. Use the same `BrainRegistry` with separate key namespaces',
      '### 4. Migrate without breaking `franken-web`',
      '### 5. Reuse the governed Beast dispatch seam',
      '/v1/chat/ws',
      'forWorkspaceHive(workspaceId)',
      'BeastDispatchService.createRun',
    ]) {
      expect(adr).toContain(decision);
    }
  });

  it('keeps the decision discoverable from architecture, onboarding, and package docs', () => {
    for (const path of [
      'docs/ARCHITECTURE.md',
      'docs/onboarding/RAMP_UP.md',
      'packages/franken-brain/README.md',
      'packages/franken-orchestrator/README.md',
      'packages/franken-web/README.md',
    ]) {
      expect(readDoc(path), `${path} must link the Hive Brain ADR`).toContain(ADR_PATH);
    }
  });

  it('preserves the existing transport and governed-dispatch invariants', () => {
    const adr = readDoc(ADR_PATH);

    expect(adr).toContain('does **not** replace `/v1/chat/ws`');
    expect(adr).toContain('one persistent brain conversation per');
    expect(adr).toContain('`supervisedAgents`');
    expect(adr).toContain('`crossAgentSummary`');
    expect(adr).toContain('keyed by canonical `conversationId`');
    expect(adr).toContain('does not expose a direct');
    expect(adr.replaceAll('\n', ' ')).toContain('independent dual writes are forbidden');
    expect(adr).toContain('It may not start a process/container');
    expect(adr).toContain('Those issues remain blocked until this decision is merged.');
  });
});
