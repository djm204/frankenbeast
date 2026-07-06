import { mkdirSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { createBrainAdapter } from './brain-adapter';

const getDbPath = () => join(process.cwd(), '.fbeast-test', `memory-adapter-${randomBytes(8).toString('hex')}.db`);

describe('brain adapter', () => {
  const dbPaths: string[] = [];

  afterEach(() => {
    for (const dbPath of dbPaths.splice(0)) {
      unlinkSync(dbPath);
    }
  });

  it('stores and queries only supported memory types', async () => {
    const dbPath = getDbPath();
    dbPaths.push(dbPath);
    mkdirSync('.fbeast-test', { recursive: true });

    const brain = createBrainAdapter(dbPath);
    await brain.store({ key: 'task-1', value: 'working entry', type: 'working' });
    await brain.store({ key: 'evt-1', value: 'episode summary', type: 'episodic' });

    const workingResult = await brain.query({ query: 'task', type: 'working', limit: 5 });
    expect(workingResult.some((row) => row.key === 'task-1' && row.type === 'working')).toBe(true);

    const episodicResult = await brain.query({ query: 'episode', type: 'episodic', limit: 5 });
    expect(episodicResult.some((row) => row.type === 'episodic')).toBe(true);
  });

  it('rejects unsupported memory type', async () => {
    const dbPath = getDbPath();
    dbPaths.push(dbPath);
    mkdirSync('.fbeast-test', { recursive: true });

    const brain = createBrainAdapter(dbPath);

    await expect(brain.store({ key: 'k', value: 'v', type: 'recovery' as string })).rejects.toThrow(
      'Unsupported memory type: recovery. Supported types: working, episodic',
    );

    await expect(brain.query({ query: 'any', type: 'recovery' as string, limit: 10 })).rejects.toThrow(
      'Unsupported memory type: recovery. Supported types: working, episodic',
    );
  });
});
