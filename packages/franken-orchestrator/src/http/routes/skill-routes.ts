import { Hono } from 'hono';
import { ZodError } from 'zod';
import { isUnsafeSkillPathError, type SkillManager } from '../../skills/skill-manager.js';
import { SkillHealthChecker } from '../../skills/skill-health-checker.js';
import type { ProviderRegistry } from '../../providers/provider-registry.js';
import { HttpError, parseJsonBody } from '../middleware.js';

function isSkillInstallValidationError(err: unknown): boolean {
  return err instanceof ZodError
    || isUnsafeSkillPathError(err)
    || (err instanceof Error && err.message.startsWith('Invalid skill name '));
}

function skillInstallErrorMessage(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues
      .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
      .join('; ');
  }
  if (isUnsafeSkillPathError(err)) {
    return 'Unsafe skill install path';
  }
  return err instanceof Error ? err.message : 'Failed to install skill';
}

export function createSkillRoutes(deps: {
  skillManager: SkillManager;
  providerRegistry: ProviderRegistry;
  healthChecker?: SkillHealthChecker;
}): Hono {
  const app = new Hono();
  const healthChecker = deps.healthChecker ?? new SkillHealthChecker();

  app.get('/', (c) => {
    const skills = deps.skillManager.listInstalled();
    return c.json({ skills });
  });

  app.get('/:name/health', async (c) => {
    const name = c.req.param('name');
    let mcpConfig;
    try {
      mcpConfig = deps.skillManager.readMcpConfig(name);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed';
      if (message.startsWith('Invalid skill name ')) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: `Failed to read MCP config for skill '${name}'` }, 500);
    }

    if (!mcpConfig) {
      return c.json({ error: `Skill '${name}' not found` }, 404);
    }

    const health = await healthChecker.getStatus(name, mcpConfig);
    return c.json({ health });
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
    let body: Record<string, unknown>;
    try {
      body = (await parseJsonBody(c)) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 400) {
        return c.json({ error: 'Invalid JSON' }, 400);
      }
      throw err;
    }

    try {
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
    } catch (err) {
      if (!isSkillInstallValidationError(err)) {
        throw err;
      }
      return c.json({ error: skillInstallErrorMessage(err) }, 400);
    }

    return c.json({ error: 'Must provide catalogEntry or custom' }, 400);
  });

  app.patch('/:name', async (c) => {
    const name = c.req.param('name');
    let body: { enabled?: boolean };
    try {
      body = (await parseJsonBody(c)) as { enabled?: boolean };
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 400) {
        return c.json({ error: 'Invalid JSON' }, 400);
      }
      throw err;
    }

    try {
      if (body.enabled === true) {
        deps.skillManager.enable(name);
      } else if (body.enabled === false) {
        deps.skillManager.disable(name);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed';
      return c.json({ error: message }, 404);
    }

    const skills = deps.skillManager.listInstalled();
    const skill = skills.find((s) => s.name === name);
    if (!skill) {
      return c.json({ error: `Skill '${name}' not found` }, 404);
    }
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
    let body: { content: string };
    try {
      body = (await parseJsonBody(c)) as { content: string };
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 400) {
        return c.json({ error: 'Invalid JSON' }, 400);
      }
      throw err;
    }
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
