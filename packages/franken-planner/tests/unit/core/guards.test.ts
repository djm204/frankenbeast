import { describe, it, expect } from 'vitest';
import { isTask, isIntent } from '../../../src/core/guards';
import { createTaskId } from '../../../src/core/types';

describe('isTask', () => {
  it('returns true for a valid Task', () => {
    expect(
      isTask({
        id: createTaskId('t-1'),
        objective: 'Do something',
        requiredSkills: ['typescript'],
        dependsOn: [],
        status: 'pending',
      })
    ).toBe(true);
  });

  it('returns true with optional metadata present', () => {
    expect(
      isTask({
        id: createTaskId('t-2'),
        objective: 'Do something else',
        requiredSkills: [],
        dependsOn: [createTaskId('t-1')],
        status: 'completed',
        metadata: { key: 'value' },
      })
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isTask(null)).toBe(false);
  });

  it('returns false for a non-object primitive', () => {
    expect(isTask('string')).toBe(false);
    expect(isTask(42)).toBe(false);
  });

  it('returns false when id is missing', () => {
    expect(
      isTask({ objective: 'x', requiredSkills: [], dependsOn: [], status: 'pending' })
    ).toBe(false);
  });

  it('returns false when id is not a string', () => {
    expect(
      isTask({ id: 123, objective: 'x', requiredSkills: [], dependsOn: [], status: 'pending' })
    ).toBe(false);
  });

  it('returns false when objective is missing', () => {
    expect(
      isTask({ id: createTaskId('t-1'), requiredSkills: [], dependsOn: [], status: 'pending' })
    ).toBe(false);
  });

  it('returns false when requiredSkills is not an array', () => {
    expect(
      isTask({
        id: createTaskId('t-1'),
        objective: 'x',
        requiredSkills: 'typescript',
        dependsOn: [],
        status: 'pending',
      })
    ).toBe(false);
  });

  it('returns false when requiredSkills contains non-strings', () => {
    expect(
      isTask({
        id: createTaskId('t-1'),
        objective: 'x',
        requiredSkills: [42],
        dependsOn: [],
        status: 'pending',
      })
    ).toBe(false);
  });

  it('returns false when dependsOn contains non-strings', () => {
    expect(
      isTask({
        id: createTaskId('t-1'),
        objective: 'x',
        requiredSkills: [],
        dependsOn: [42],
        status: 'pending',
      })
    ).toBe(false);
  });

  it('returns false when status is invalid', () => {
    expect(
      isTask({
        id: createTaskId('t-1'),
        objective: 'x',
        requiredSkills: [],
        dependsOn: [],
        status: 'invalid',
      })
    ).toBe(false);
  });

  it('returns false when status is missing', () => {
    expect(
      isTask({ id: createTaskId('t-1'), objective: 'x', requiredSkills: [], dependsOn: [] })
    ).toBe(false);
  });
});

describe('isIntent', () => {
  it('returns true for a minimal valid Intent', () => {
    expect(isIntent({ goal: 'Build something' })).toBe(true);
  });

  it('returns true with a valid strategy', () => {
    expect(isIntent({ goal: 'Build something', strategy: 'linear' })).toBe(true);
    expect(isIntent({ goal: 'Build something', strategy: 'parallel' })).toBe(true);
    expect(isIntent({ goal: 'Build something', strategy: 'recursive' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isIntent(null)).toBe(false);
  });

  it('returns false for a non-object', () => {
    expect(isIntent(42)).toBe(false);
    expect(isIntent('goal')).toBe(false);
  });

  it('returns false when goal is missing', () => {
    expect(isIntent({ strategy: 'linear' })).toBe(false);
  });

  it('returns false when goal is not a string', () => {
    expect(isIntent({ goal: 123 })).toBe(false);
  });

  it('returns false when strategy is an invalid value', () => {
    expect(isIntent({ goal: 'x', strategy: 'quantum' })).toBe(false);
  });

  it('returns false when strategy is a non-string type', () => {
    expect(isIntent({ goal: 'x', strategy: 42 })).toBe(false);
  });
});
