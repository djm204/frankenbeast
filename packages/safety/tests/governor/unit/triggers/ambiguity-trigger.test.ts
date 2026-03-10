import { describe, it, expect } from 'vitest';
import { AmbiguityTrigger } from '../../../../src/governor/triggers/ambiguity-trigger.js';
import type { AmbiguityTriggerContext } from '../../../../src/governor/triggers/ambiguity-trigger.js';

function makeAmbiguityContext(overrides: Partial<AmbiguityTriggerContext> = {}): AmbiguityTriggerContext {
  return { hasUnresolvedDependency: false, hasAdrConflict: false, ...overrides };
}

describe('AmbiguityTrigger', () => {
  const trigger = new AmbiguityTrigger();

  it('has triggerId "ambiguity"', () => {
    expect(trigger.triggerId).toBe('ambiguity');
  });

  it('triggers when hasUnresolvedDependency is true', () => {
    const result = trigger.evaluate(makeAmbiguityContext({ hasUnresolvedDependency: true }));
    expect(result.triggered).toBe(true);
  });

  it('triggers when hasAdrConflict is true', () => {
    const result = trigger.evaluate(makeAmbiguityContext({ hasAdrConflict: true }));
    expect(result.triggered).toBe(true);
  });

  it('does not trigger when both are false', () => {
    const result = trigger.evaluate(makeAmbiguityContext());
    expect(result.triggered).toBe(false);
  });

  it('includes reason when triggered for dependency', () => {
    const result = trigger.evaluate(makeAmbiguityContext({ hasUnresolvedDependency: true }));
    if (result.triggered) {
      expect(result.reason).toContain('dependency');
    }
  });

  it('includes reason when triggered for ADR conflict', () => {
    const result = trigger.evaluate(makeAmbiguityContext({ hasAdrConflict: true }));
    if (result.triggered) {
      expect(result.reason).toContain('ADR');
    }
  });

  it('sets severity to high when triggered', () => {
    const result = trigger.evaluate(makeAmbiguityContext({ hasUnresolvedDependency: true }));
    if (result.triggered) {
      expect(result.severity).toBe('high');
    }
  });
});
