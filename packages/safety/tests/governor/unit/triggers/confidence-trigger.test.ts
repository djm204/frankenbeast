import { describe, it, expect } from 'vitest';
import { ConfidenceTrigger } from '../../../../src/governor/triggers/confidence-trigger.js';
import type { ConfidenceTriggerContext } from '../../../../src/governor/triggers/confidence-trigger.js';

function makeConfidenceContext(overrides: Partial<ConfidenceTriggerContext> = {}): ConfidenceTriggerContext {
  return { confidenceScore: 0.8, ...overrides };
}

describe('ConfidenceTrigger', () => {
  it('has triggerId "confidence"', () => {
    const trigger = new ConfidenceTrigger();
    expect(trigger.triggerId).toBe('confidence');
  });

  it('triggers below default threshold (0.5)', () => {
    const trigger = new ConfidenceTrigger();
    const result = trigger.evaluate(makeConfidenceContext({ confidenceScore: 0.3 }));
    expect(result.triggered).toBe(true);
  });

  it('does not trigger above default threshold', () => {
    const trigger = new ConfidenceTrigger();
    const result = trigger.evaluate(makeConfidenceContext({ confidenceScore: 0.8 }));
    expect(result.triggered).toBe(false);
  });

  it('does not trigger at exactly the threshold', () => {
    const trigger = new ConfidenceTrigger(0.5);
    const result = trigger.evaluate(makeConfidenceContext({ confidenceScore: 0.5 }));
    expect(result.triggered).toBe(false);
  });

  it('uses custom threshold when provided', () => {
    const trigger = new ConfidenceTrigger(0.9);
    const result = trigger.evaluate(makeConfidenceContext({ confidenceScore: 0.8 }));
    expect(result.triggered).toBe(true);
  });

  it('includes confidence score in reason when triggered', () => {
    const trigger = new ConfidenceTrigger();
    const result = trigger.evaluate(makeConfidenceContext({ confidenceScore: 0.2 }));
    if (result.triggered) {
      expect(result.reason).toContain('0.2');
    }
  });

  it('sets severity to medium when triggered', () => {
    const trigger = new ConfidenceTrigger();
    const result = trigger.evaluate(makeConfidenceContext({ confidenceScore: 0.2 }));
    if (result.triggered) {
      expect(result.severity).toBe('medium');
    }
  });
});
