import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsMockState = vi.hoisted(() => ({
  readdirFailures: new Set<string>(),
  readFailures: new Set<string>(),
  statFailures: new Set<string>(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');

  return {
    ...actual,
    readdirSync: (path: Parameters<typeof actual.readdirSync>[0], options?: Parameters<typeof actual.readdirSync>[1]) => {
      if (fsMockState.readdirFailures.has(String(path))) {
        throw Object.assign(new Error(`simulated readdir failure for ${String(path)}`), { code: 'ENOENT' });
      }
      return actual.readdirSync(path, options as never);
    },
    readFileSync: (path: Parameters<typeof actual.readFileSync>[0], options?: Parameters<typeof actual.readFileSync>[1]) => {
      if (fsMockState.readFailures.has(String(path))) {
        throw Object.assign(new Error(`simulated read failure for ${String(path)}`), { code: 'EACCES' });
      }
      return actual.readFileSync(path, options as never);
    },
    statSync: (path: Parameters<typeof actual.statSync>[0], options?: Parameters<typeof actual.statSync>[1]) => {
      if (fsMockState.statFailures.has(String(path))) {
        throw Object.assign(new Error(`simulated stat failure for ${String(path)}`), { code: 'ENOENT' });
      }
      return actual.statSync(path, options as never);
    },
  };
});

const { createSkillsAdapter } = await import('./skills-adapter.js');

describe('SkillsAdapter filesystem race handling', () => {
  let root: string;

  beforeEach(async () => {
    fsMockState.readdirFailures.clear();
    fsMockState.readFailures.clear();
    fsMockState.statFailures.clear();
    root = await mkdtemp(join(tmpdir(), 'skills-adapter-'));
    await mkdir(join(root, 'skills'), { recursive: true });
    await writeFile(join(root, 'config.json'), JSON.stringify({ skills: { enabled: ['stable', 'flaky'] } }));
  });

  afterEach(async () => {
    fsMockState.readdirFailures.clear();
    fsMockState.readFailures.clear();
    fsMockState.statFailures.clear();
    await rm(root, { recursive: true, force: true });
  });

  it('returns an empty skill list when the skills directory disappears after the existence check', async () => {
    const skillsDir = join(root, 'skills');
    fsMockState.readdirFailures.add(skillsDir);

    await expect(createSkillsAdapter(join(root, 'beast.db')).list({})).resolves.toEqual([]);
  });

  it('skips a skill whose directory disappears between discovery and stat', async () => {
    await createSkill('stable', { context: '# Stable skill\nUseful.' });
    await createSkill('flaky');
    fsMockState.statFailures.add(join(root, 'skills', 'flaky'));

    const rows = await createSkillsAdapter(join(root, 'beast.db')).list({});

    expect(rows.map((row) => row.name)).toEqual(['stable']);
  });

  it('loads skill info without throwing when context.md becomes unreadable after existsSync', async () => {
    const contextPath = await createSkill('flaky', { context: '# Flaky skill\nUseful.' });
    fsMockState.readFailures.add(contextPath);

    const info = await createSkillsAdapter(join(root, 'beast.db')).info('flaky');

    expect(info).toMatchObject({
      name: 'flaky',
      enabled: true,
      hasContext: true,
      context: undefined,
      tools: [],
    });
  });

  async function createSkill(name: string, options: { context?: string; mcp?: unknown } = {}): Promise<string> {
    const skillDir = join(root, 'skills', name);
    const contextPath = join(skillDir, 'context.md');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'mcp.json'),
      JSON.stringify(options.mcp ?? { mcpServers: { [`${name}-server`]: { command: name } } }),
    );
    if (options.context !== undefined) {
      await writeFile(contextPath, options.context);
    }
    return contextPath;
  }
});
