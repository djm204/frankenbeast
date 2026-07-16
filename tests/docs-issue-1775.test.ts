import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const onboarding = () => readFileSync(join(root, 'ONBOARDING.md'), 'utf8');

describe('issue #1775 agent handoff template validator docs', () => {
  it('documents validator usage and structured output for onboarding handoffs', () => {
    const doc = onboarding();

    expect(doc).toContain('## Agent handoff template validator');
    expect(doc).toContain('validateAgentHandoffTemplate(markdown)');
    for (const field of [
      'valid',
      'passed',
      'total',
      'missingSections',
      'findings',
      'operatorGuidance',
    ]) {
      expect(doc).toContain(field);
    }
  });

  it('documents required sections and placeholder failure guidance', () => {
    const doc = onboarding();

    for (const required of [
      'Scope and objective',
      'Current state and decisions',
      'Verification evidence',
      'Blockers and next action',
      'Artifacts and links',
      'Learning and reuse',
    ]) {
      expect(doc).toContain(required);
    }

    expect(doc).toContain('placeholder');
    expect(doc).toContain('missing');
    expect(doc).toContain('<TBD>');
  });
});
