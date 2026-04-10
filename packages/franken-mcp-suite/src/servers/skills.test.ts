import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSkillsServer } from './skills.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

describe('Skills Server', () => {
  let store: SqliteStore;
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `fbeast-sk-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    store = createSqliteStore(join(dir, 'beast.db'));
  });

  afterEach(() => {
    store.close();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('exposes 3 tools', () => {
    const server = createSkillsServer(store);
    const names = server.tools.map((t) => t.name);
    expect(names).toEqual(['fbeast_skills_list', 'fbeast_skills_discover', 'fbeast_skills_info']);
  });

  it('list returns skills from skill_state table', async () => {
    const server = createSkillsServer(store);
    const listTool = server.tools.find((t) => t.name === 'fbeast_skills_list')!;

    store.db.prepare(`INSERT INTO skill_state (name, enabled, config) VALUES (?, ?, ?)`).run(
      'code-review', 1, JSON.stringify({ description: 'Automated code review' }),
    );
    store.db.prepare(`INSERT INTO skill_state (name, enabled, config) VALUES (?, ?, ?)`).run(
      'test-gen', 0, JSON.stringify({ description: 'Test generation' }),
    );

    const result = await listTool.handler({});
    const text = result.content[0]!.text;
    expect(text).toContain('code-review');
    expect(text).toContain('test-gen');
  });

  it('list with enabled filter', async () => {
    const server = createSkillsServer(store);
    const listTool = server.tools.find((t) => t.name === 'fbeast_skills_list')!;

    store.db.prepare(`INSERT INTO skill_state (name, enabled, config) VALUES (?, ?, ?)`).run(
      'active-skill', 1, '{}',
    );
    store.db.prepare(`INSERT INTO skill_state (name, enabled, config) VALUES (?, ?, ?)`).run(
      'disabled-skill', 0, '{}',
    );

    const result = await listTool.handler({ enabled: 'true' });
    const text = result.content[0]!.text;
    expect(text).toContain('active-skill');
    expect(text).not.toContain('disabled-skill');
  });

  it('info returns skill details', async () => {
    const server = createSkillsServer(store);
    const infoTool = server.tools.find((t) => t.name === 'fbeast_skills_info')!;

    store.db.prepare(`INSERT INTO skill_state (name, enabled, config) VALUES (?, ?, ?)`).run(
      'my-skill', 1, JSON.stringify({ description: 'Does things', version: '1.0' }),
    );

    const result = await infoTool.handler({ skillId: 'my-skill' });
    const text = result.content[0]!.text;
    expect(text).toContain('my-skill');
    expect(text).toContain('Does things');
  });
});
