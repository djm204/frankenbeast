import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChatApp } from '../../../src/http/chat-app.js';
import type { SkillManager } from '../../../src/skills/skill-manager.js';
import type { ProviderRegistry } from '../../../src/providers/provider-registry.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/skill-routes-mounting');

function baseChatOpts() {
  return {
    sessionStoreDir: join(TMP, 'chat'),
    llm: { complete: vi.fn().mockResolvedValue('hello') },
    projectName: 'skill-test-project',
  };
}

function mockSkillManager(): SkillManager {
  return {
    listInstalled: vi.fn().mockReturnValue([
      { name: 'test-skill', enabled: true },
    ]),
  } as unknown as SkillManager;
}

function mockProviderRegistry(): ProviderRegistry {
  return {
    listProviders: vi.fn().mockResolvedValue([]),
  } as unknown as ProviderRegistry;
}

describe('skill routes mounting in createChatApp', () => {
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('does not mount /api/skills when skillManager is not provided', async () => {
    mkdirSync(TMP, { recursive: true });
    const app = createChatApp(baseChatOpts());

    const res = await app.request('/api/skills');
    expect(res.status).toBe(404);
  });

  it('mounts /api/skills when skillManager and providerRegistry are provided', async () => {
    mkdirSync(TMP, { recursive: true });
    const sm = mockSkillManager();
    const pr = mockProviderRegistry();
    const app = createChatApp({
      ...baseChatOpts(),
      skillManager: sm,
      providerRegistry: pr,
    });

    const res = await app.request('/api/skills');
    expect(res.status).toBe(200);

    const body = await res.json() as { skills: unknown[] };
    expect(body.skills).toEqual([{ name: 'test-skill', enabled: true }]);
    expect(sm.listInstalled).toHaveBeenCalled();
  });

  it('does not mount /api/skills when only skillManager is provided without providerRegistry', async () => {
    mkdirSync(TMP, { recursive: true });
    const app = createChatApp({
      ...baseChatOpts(),
      skillManager: mockSkillManager(),
    });

    // Without providerRegistry, routes should not mount
    const res = await app.request('/api/skills');
    expect(res.status).toBe(404);
  });
});
