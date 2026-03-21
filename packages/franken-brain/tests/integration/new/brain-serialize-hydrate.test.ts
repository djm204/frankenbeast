import { describe, it, expect } from 'vitest';
import { BrainSnapshotSchema } from '@franken/types';
import { SqliteBrain } from '../../../src/new/sqlite-brain.js';

describe('Brain serialize/hydrate integration', () => {
  it('full lifecycle: record events, checkpoint, serialize, hydrate, verify state', () => {
    const brain1 = new SqliteBrain();
    brain1.working.set('task', 'fix auth');
    brain1.working.set('progress', 0.5);
    brain1.episodic.record({
      type: 'failure',
      step: 'build',
      summary: 'Missing import in auth.ts',
      createdAt: new Date().toISOString(),
    });
    brain1.recovery.checkpoint({
      runId: 'run-1',
      phase: 'execution',
      step: 3,
      context: { files: ['auth.ts'] },
      timestamp: new Date().toISOString(),
    });

    const snapshot = brain1.serialize();
    const brain2 = SqliteBrain.hydrate(snapshot);

    expect(brain2.working.get('task')).toBe('fix auth');
    expect(brain2.working.get('progress')).toBe(0.5);
    expect(brain2.episodic.count()).toBe(1);
    expect(brain2.episodic.recentFailures(1)[0]!.summary).toContain('Missing import');
    expect(brain2.recovery.lastCheckpoint()?.phase).toBe('execution');

    brain1.close();
    brain2.close();
  });

  it('validates snapshot against BrainSnapshotSchema', () => {
    const brain = new SqliteBrain();
    brain.working.set('key', 'value');
    const snapshot = brain.serialize();
    expect(() => BrainSnapshotSchema.parse(snapshot)).not.toThrow();
    brain.close();
  });

  it('handles multiple serialize/hydrate cycles', () => {
    const brain1 = new SqliteBrain();
    brain1.working.set('gen', 1);
    brain1.episodic.record({
      type: 'decision',
      summary: 'Generation 1 decision',
      createdAt: new Date().toISOString(),
    });

    const snap1 = brain1.serialize();
    const brain2 = SqliteBrain.hydrate(snap1);
    brain2.working.set('gen', 2);
    brain2.episodic.record({
      type: 'observation',
      summary: 'Generation 2 observation',
      createdAt: new Date().toISOString(),
    });

    const snap2 = brain2.serialize();
    const brain3 = SqliteBrain.hydrate(snap2);

    expect(brain3.working.get('gen')).toBe(2);
    expect(brain3.episodic.count()).toBe(2);

    brain1.close();
    brain2.close();
    brain3.close();
  });

  it('preserves event details through serialization', () => {
    const brain1 = new SqliteBrain();
    const details = { error: 'ENOENT', path: '/app/src/auth.ts', stack: 'at line 42' };
    brain1.episodic.record({
      type: 'failure',
      step: 'file-read',
      summary: 'File not found',
      details,
      createdAt: new Date().toISOString(),
    });

    const snapshot = brain1.serialize();
    const brain2 = SqliteBrain.hydrate(snapshot);
    const events = brain2.episodic.recent(1);
    expect(events[0]!.details).toEqual(details);

    brain1.close();
    brain2.close();
  });
});
