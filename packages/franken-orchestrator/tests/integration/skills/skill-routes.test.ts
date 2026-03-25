import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Hono } from 'hono';
import { SkillManager } from '../../../src/skills/skill-manager.js';
import { createSkillRoutes } from '../../../src/http/routes/skill-routes.js';
import type { ProviderRegistry } from '../../../src/providers/provider-registry.js';

function mockProviderRegistry(): ProviderRegistry {
  return {
    listProviders: vi.fn().mockResolvedValue([
      {
        provider: {
          name: 'claude-cli',
          discoverSkills: vi.fn().mockResolvedValue([
            { name: 'github', description: 'GH', provider: 'claude-cli', installConfig: { command: 'npx' }, authFields: [] },
          ]),
        },
        available: true,
      },
      {
        provider: { name: 'openai-api' },
        available: true,
      },
    ]),
  } as unknown as ProviderRegistry;
}

describe('Skill API routes', () => {
  let tempDir: string;
  let skillsDir: string;
  let manager: SkillManager;
  let app: Hono;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skill-routes-'));
    skillsDir = join(tempDir, 'skills');
    manager = new SkillManager(skillsDir, new Set());
    const routes = createSkillRoutes({
      skillManager: manager,
      providerRegistry: mockProviderRegistry(),
    });
    app = new Hono();
    app.route('/api/skills', routes);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('GET /api/skills', () => {
    it('returns empty array when no skills', async () => {
      const res = await app.request('/api/skills');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.skills).toEqual([]);
    });

    it('returns installed skills with metadata', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'claude-cli',
        installConfig: { command: 'npx' },
        authFields: [],
      });
      const res = await app.request('/api/skills');
      const body = await res.json();
      expect(body.skills).toHaveLength(1);
      expect(body.skills[0].name).toBe('github');
    });
  });

  describe('GET /api/skills/catalog/:provider', () => {
    it('returns catalog from provider', async () => {
      const res = await app.request('/api/skills/catalog/claude-cli');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.catalog).toHaveLength(1);
      expect(body.catalog[0].name).toBe('github');
    });

    it('returns 404 for unknown provider', async () => {
      const res = await app.request('/api/skills/catalog/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns empty catalog for providers without discovery', async () => {
      const res = await app.request('/api/skills/catalog/openai-api');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.catalog).toEqual([]);
    });
  });

  describe('POST /api/skills', () => {
    it('installs from catalog entry', async () => {
      const res = await app.request('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogEntry: {
            name: 'linear',
            description: 'Linear',
            provider: 'claude-cli',
            installConfig: { command: 'npx', args: ['-y', '@mcp/linear'] },
            authFields: [],
          },
        }),
      });
      expect(res.status).toBe(201);
      expect(manager.exists('linear')).toBe(true);
    });

    it('installs custom MCP server', async () => {
      const res = await app.request('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom: { name: 'my-tool', config: { command: 'node', args: ['server.js'] } },
        }),
      });
      expect(res.status).toBe(201);
      expect(manager.exists('my-tool')).toBe(true);
    });

    it('returns 400 when neither provided', async () => {
      const res = await app.request('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/skills/:name', () => {
    it('enables a skill', async () => {
      await manager.install({
        name: 'github', description: 'GH', provider: 'cli',
        installConfig: { command: 'npx' }, authFields: [],
      });
      const res = await app.request('/api/skills/github', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.skill.enabled).toBe(true);
    });

    it('disables a skill', async () => {
      await manager.install({
        name: 'github', description: 'GH', provider: 'cli',
        installConfig: { command: 'npx' }, authFields: [],
      });
      manager.enable('github');
      const res = await app.request('/api/skills/github', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      const body = await res.json();
      expect(body.skill.enabled).toBe(false);
    });
  });

  describe('DELETE /api/skills/:name', () => {
    it('removes skill', async () => {
      await manager.install({
        name: 'github', description: 'GH', provider: 'cli',
        installConfig: { command: 'npx' }, authFields: [],
      });
      const res = await app.request('/api/skills/github', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.removed).toBe('github');
      expect(manager.exists('github')).toBe(false);
    });
  });

  describe('Context routes (5.11)', () => {
    it('GET returns null when no context', async () => {
      await manager.install({
        name: 'github', description: 'GH', provider: 'cli',
        installConfig: { command: 'npx' }, authFields: [],
      });
      const res = await app.request('/api/skills/github/context');
      const body = await res.json();
      expect(body.exists).toBe(false);
    });

    it('PUT writes context, GET reads it back', async () => {
      await manager.install({
        name: 'github', description: 'GH', provider: 'cli',
        installConfig: { command: 'npx' }, authFields: [],
      });
      await app.request('/api/skills/github/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Team rules\nAlways lint first' }),
      });
      const res = await app.request('/api/skills/github/context');
      const body = await res.json();
      expect(body.exists).toBe(true);
      expect(body.content).toContain('Always lint first');
    });
  });
});
