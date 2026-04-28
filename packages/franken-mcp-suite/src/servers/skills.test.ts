import { describe, expect, it, vi } from 'vitest';
import { createSkillsServer } from './skills.js';

describe('Skills Server', () => {
  it('exposes 3 tools', () => {
    const server = createSkillsServer({
      skills: {
        list: vi.fn(),
        info: vi.fn(),
      },
    });

    const names = server.tools.map((t) => t.name);
    expect(names).toEqual(['fbeast_skills_list', 'fbeast_skills_discover', 'fbeast_skills_load']);
  });

  it('delegates list, discover, and info calls to the skills adapter', async () => {
    const skills = {
      list: vi.fn()
        .mockResolvedValueOnce([
          {
            name: 'github',
            enabled: true,
            description: 'GitHub workflow automation',
            updatedAt: '2026-04-10T00:00:00.000Z',
          },
        ])
        .mockResolvedValueOnce([
          {
            name: 'github',
            enabled: true,
            description: 'GitHub workflow automation',
            updatedAt: '2026-04-10T00:00:00.000Z',
          },
          {
            name: 'slack',
            enabled: false,
            description: 'Slack notifications',
            updatedAt: '2026-04-09T00:00:00.000Z',
          },
        ]),
      info: vi.fn().mockResolvedValue({
        name: 'github',
        enabled: true,
        description: 'GitHub workflow automation',
        updatedAt: '2026-04-10T00:00:00.000Z',
        mcpServerCount: 1,
      }),
    };

    const server = createSkillsServer({ skills });
    const listTool = server.tools.find((t) => t.name === 'fbeast_skills_list')!;
    const discoverTool = server.tools.find((t) => t.name === 'fbeast_skills_discover')!;
    const loadTool = server.tools.find((t) => t.name === 'fbeast_skills_load')!;

    const listResult = await listTool.handler({ enabled: 'true' });
    expect(skills.list).toHaveBeenCalledWith({ enabled: true });
    expect(listResult.content[0]!.text).toContain('github');

    const discoverResult = await discoverTool.handler({ query: 'git' });
    expect(skills.list).toHaveBeenLastCalledWith({});
    expect(discoverResult.content[0]!.text).toContain('github');
    expect(discoverResult.content[0]!.text).not.toContain('slack');

    const infoResult = await loadTool.handler({ skillId: 'github' });
    expect(skills.info).toHaveBeenCalledWith('github');
    expect(infoResult.content[0]!.text).toContain('GitHub workflow automation');
  });
});
