import { Hono } from 'hono';
import type { SkillManager } from '../../skills/skill-manager.js';
import type { ProviderRegistry } from '../../providers/provider-registry.js';

export function createSkillRoutes(deps: {
  skillManager: SkillManager;
  providerRegistry: ProviderRegistry;
}): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const skills = deps.skillManager.listInstalled();
    return c.json({ skills });
  });

  app.get('/catalog/:provider', async (c) => {
    const providerName = c.req.param('provider');
    const providers = await deps.providerRegistry.listProviders();
    const match = providers.find((p) => p.provider.name === providerName);

    if (!match) {
      return c.json({ error: `Provider '${providerName}' not found` }, 404);
    }
    if (!match.provider.discoverSkills) {
      return c.json({
        catalog: [],
        message: 'Provider does not support skill discovery',
      });
    }

    const catalog = await match.provider.discoverSkills();
    return c.json({ catalog });
  });

  app.post('/', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;

    if (body['catalogEntry']) {
      const entry = body['catalogEntry'] as Parameters<
        SkillManager['install']
      >[0];
      await deps.skillManager.install(entry);
      return c.json({ installed: entry.name }, 201);
    }

    if (body['custom']) {
      const custom = body['custom'] as { name: string; config: Parameters<SkillManager['installCustom']>[1] };
      await deps.skillManager.installCustom(custom.name, custom.config);
      return c.json({ installed: custom.name }, 201);
    }

    return c.json({ error: 'Must provide catalogEntry or custom' }, 400);
  });

  app.patch('/:name', async (c) => {
    const name = c.req.param('name');
    const body = (await c.req.json()) as { enabled?: boolean };

    if (body.enabled === true) {
      deps.skillManager.enable(name);
    } else if (body.enabled === false) {
      deps.skillManager.disable(name);
    }

    const skills = deps.skillManager.listInstalled();
    const skill = skills.find((s) => s.name === name);
    return c.json({ skill });
  });

  app.delete('/:name', (c) => {
    const name = c.req.param('name');
    deps.skillManager.remove(name);
    return c.json({ removed: name });
  });

  // Context read/write routes (Chunk 5.11)
  app.get('/:name/context', (c) => {
    const name = c.req.param('name');
    const content = deps.skillManager.readContext(name);
    if (content === null) {
      return c.json({ content: null, exists: false });
    }
    return c.json({ content, exists: true });
  });

  app.put('/:name/context', async (c) => {
    const name = c.req.param('name');
    const body = (await c.req.json()) as { content: string };
    try {
      deps.skillManager.writeContext(name, body.content);
      return c.json({ updated: true });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Failed' },
        400,
      );
    }
  });

  return app;
}
