import { describe, it, expect } from 'vitest';
import { SkillTrigger } from '../../../src/triggers/skill-trigger.js';
import type { SkillTriggerContext } from '../../../src/triggers/skill-trigger.js';

function makeSkillContext(overrides: Partial<SkillTriggerContext> = {}): SkillTriggerContext {
  return {
    skillId: 'test-skill',
    requiresHitl: false,
    isDestructive: false,
    ...overrides,
  };
}

describe('SkillTrigger', () => {
  const trigger = new SkillTrigger();

  it('has triggerId "skill"', () => {
    expect(trigger.triggerId).toBe('skill');
  });

  it('triggers when requiresHitl is true', () => {
    const result = trigger.evaluate(makeSkillContext({ requiresHitl: true }));
    expect(result.triggered).toBe(true);
  });

  it('triggers when isDestructive is true', () => {
    const result = trigger.evaluate(makeSkillContext({ isDestructive: true }));
    expect(result.triggered).toBe(true);
  });

  it('does not trigger when both are false', () => {
    const result = trigger.evaluate(makeSkillContext());
    expect(result.triggered).toBe(false);
  });

  it('includes skillId in reason when triggered', () => {
    const result = trigger.evaluate(makeSkillContext({ requiresHitl: true, skillId: 'deploy-prod' }));
    if (result.triggered) {
      expect(result.reason).toContain('deploy-prod');
    }
  });

  it('sets severity to high when HITL is required but skill is not destructive', () => {
    const result = trigger.evaluate(makeSkillContext({ requiresHitl: true }));
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe('high');
  });

  it('sets severity to critical when the skill is destructive', () => {
    const result = trigger.evaluate(makeSkillContext({ isDestructive: true }));
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe('critical');
  });

  it('sets severity to critical when destructive and HITL-requiring', () => {
    const result = trigger.evaluate(makeSkillContext({ requiresHitl: true, isDestructive: true }));
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe('critical');
  });
});
