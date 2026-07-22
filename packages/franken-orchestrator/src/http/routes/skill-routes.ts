import { Hono } from 'hono';
import { z, ZodError } from 'zod';
import type { McpServerConfig, SkillCatalogEntry, ToolDefinition } from '@franken/types';
import { isUnsafeSkillPathError, type SkillManager } from '../../skills/skill-manager.js';
import { SkillHealthChecker } from '../../skills/skill-health-checker.js';
import type { ProviderRegistry } from '../../providers/provider-registry.js';
import { HttpError, parseJsonBody } from '../middleware.js';

const SKILL_CONTEXT_MAX_CONTENT_BYTES = 256 * 1024;
const skillContextBodySchema = z.object({ content: z.string() });

const MAX_SKILL_NAME_LENGTH = 128;
const MAX_FIELD_LENGTH = 4_096;
const MAX_COLLECTION_ITEMS = 128;
const MAX_INPUT_SCHEMA_BYTES = 8 * 1_024;
const SAFE_SKILL_NAME = /^[a-zA-Z0-9_-]+$/;

const BoundedString = z.string().max(MAX_FIELD_LENGTH);
const SkillName = z.string()
  .min(1)
  .max(MAX_SKILL_NAME_LENGTH)
  .regex(SAFE_SKILL_NAME);

const BoundedStringRecord = z.record(
  z.string().min(1).max(MAX_SKILL_NAME_LENGTH),
  BoundedString,
).refine(
  (record) => Object.keys(record).length <= MAX_COLLECTION_ITEMS,
  `Must contain at most ${MAX_COLLECTION_ITEMS} entries`,
);

function isJsonWithinByteLimit(value: unknown, maxBytes: number): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8') <= maxBytes;
  } catch {
    return false;
  }
}

const BoundedInputSchema = z.record(
  z.string().max(MAX_SKILL_NAME_LENGTH),
  z.unknown(),
).refine(
  (record) => Object.keys(record).length <= MAX_COLLECTION_ITEMS,
  `Must contain at most ${MAX_COLLECTION_ITEMS} entries`,
).refine(
  (record) => isJsonWithinByteLimit(record, MAX_INPUT_SCHEMA_BYTES),
  `Must serialize to at most ${MAX_INPUT_SCHEMA_BYTES} bytes`,
);

const SkillInstallConfigSchema = z.object({
  command: z.string().min(1).max(MAX_FIELD_LENGTH),
  args: z.array(BoundedString).max(MAX_COLLECTION_ITEMS).optional(),
  env: BoundedStringRecord.optional(),
  url: z.string().url().max(MAX_FIELD_LENGTH).optional(),
}).strict();

const SkillToolDefinitionSchema = z.object({
  name: z.string().min(1).max(MAX_SKILL_NAME_LENGTH),
  title: BoundedString.optional(),
  description: BoundedString,
  inputSchema: BoundedInputSchema,
  outputSchema: BoundedInputSchema.optional(),
  annotations: z.object({
    title: BoundedString.optional(),
    readOnlyHint: z.boolean().optional(),
    destructiveHint: z.boolean().optional(),
    idempotentHint: z.boolean().optional(),
    openWorldHint: z.boolean().optional(),
  }).strict().optional(),
  _meta: BoundedInputSchema.optional(),
  requiresHitl: z.boolean().optional(),
}).strict();

const CatalogInstallSchema = z.object({
  name: SkillName,
  description: BoundedString,
  provider: z.string().min(1).max(MAX_SKILL_NAME_LENGTH),
  installConfig: SkillInstallConfigSchema,
  authFields: z.array(z.object({
    key: z.string().min(1).max(MAX_SKILL_NAME_LENGTH),
    label: BoundedString,
    type: z.enum(['secret', 'text']),
    required: z.boolean(),
  }).strict()).max(MAX_COLLECTION_ITEMS),
  toolDefinitions: z.array(SkillToolDefinitionSchema).max(MAX_COLLECTION_ITEMS).optional(),
}).strict();

const CustomInstallSchema = z.object({
  name: SkillName,
  config: SkillInstallConfigSchema,
}).strict();

const SkillInstallRequestSchema = z.object({
  catalogEntry: CatalogInstallSchema.optional(),
  custom: CustomInstallSchema.optional(),
}).strict().superRefine((request, ctx) => {
  if ((request.catalogEntry === undefined) === (request.custom === undefined)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Must provide exactly one of catalogEntry or custom',
    });
  }
});

function toMcpServerConfig(
  config: z.infer<typeof SkillInstallConfigSchema>,
): McpServerConfig {
  return {
    command: config.command,
    ...(config.args !== undefined ? { args: config.args } : {}),
    ...(config.env !== undefined ? { env: config.env } : {}),
    ...(config.url !== undefined ? { url: config.url } : {}),
  };
}

function toToolDefinition(
  tool: z.infer<typeof SkillToolDefinitionSchema>,
): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.requiresHitl !== undefined ? { requiresHitl: tool.requiresHitl } : {}),
  };
}

function toSkillCatalogEntry(
  entry: z.infer<typeof CatalogInstallSchema>,
): SkillCatalogEntry {
  return {
    name: entry.name,
    description: entry.description,
    provider: entry.provider,
    installConfig: toMcpServerConfig(entry.installConfig),
    authFields: entry.authFields,
    ...(entry.toolDefinitions !== undefined
      ? { toolDefinitions: entry.toolDefinitions.map(toToolDefinition) }
      : {}),
  };
}

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
    let request: z.infer<typeof SkillInstallRequestSchema>;
    try {
      request = SkillInstallRequestSchema.parse(await parseJsonBody(c));
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 400) {
        return c.json({ error: 'Invalid JSON' }, 400);
      }
      if (err instanceof ZodError) {
        return c.json({ error: skillInstallErrorMessage(err) }, 400);
      }
      throw err;
    }

    try {
      if (request.catalogEntry !== undefined) {
        await deps.skillManager.install(toSkillCatalogEntry(request.catalogEntry));
        return c.json({ installed: request.catalogEntry.name }, 201);
      }

      if (request.custom !== undefined) {
        await deps.skillManager.installCustom(
          request.custom.name,
          toMcpServerConfig(request.custom.config),
        );
        return c.json({ installed: request.custom.name }, 201);
      }

      throw new Error('Validated skill install request contained no install payload');
    } catch (err) {
      if (!isSkillInstallValidationError(err)) {
        throw err;
      }
      return c.json({ error: skillInstallErrorMessage(err) }, 400);
    }
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
    let content: string | null;
    try {
      content = deps.skillManager.readContext(name);
    } catch (err) {
      return c.json(
        { error: isUnsafeSkillPathError(err) ? 'Unsafe skill path' : err instanceof Error ? err.message : 'Failed' },
        400,
      );
    }
    if (content === null) {
      return c.json({ content: null, exists: false });
    }
    return c.json({ content, exists: true });
  });

  app.put('/:name/context', async (c) => {
    const name = c.req.param('name');
    let rawBody: unknown;
    try {
      rawBody = await parseJsonBody(c);
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 400) {
        return c.json({ error: 'Invalid JSON' }, 400);
      }
      throw err;
    }

    const parsedBody = skillContextBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return c.json({ error: 'Context content must be a string' }, 400);
    }
    if (Buffer.byteLength(parsedBody.data.content, 'utf8') > SKILL_CONTEXT_MAX_CONTENT_BYTES) {
      return c.json(
        { error: `Context content exceeds the ${SKILL_CONTEXT_MAX_CONTENT_BYTES}-byte limit` },
        413,
      );
    }

    try {
      deps.skillManager.writeContext(name, parsedBody.data.content);
      return c.json({ updated: true });
    } catch (err) {
      return c.json(
        { error: isUnsafeSkillPathError(err) ? 'Unsafe skill path' : err instanceof Error ? err.message : 'Failed' },
        400,
      );
    }
  });

  return app;
}
