# Chunk 8.7: Run Config Schema v2 — Zod Validation + YAML Parsing

**Phase:** 8 — Wire Everything Together
**Depends on:** Chunk 8.1 (defines RunConfig TypeScript interfaces), Chunk 4.3 (security profiles), Chunk 4.5.04 (comms config), Chunk 3.1 (provider types)
**Estimated size:** Medium (~180 lines)

---

## Purpose

Chunk 8.1 defines the extended `RunConfig` TypeScript interfaces (providers, security, critique, reflection, brain, skillsDir). But the actual `run-config-loader.ts` needs Zod schemas for runtime validation, YAML parsing for the config file, CLI flag mapping, and sensible defaults. Without this chunk, the RunConfig interfaces exist but can't be loaded from disk or validated at runtime.

## Design

### Config File Format

Users create a `.frankenbeast.yml` (or `.frankenbeast.yaml` / `.frankenbeast.json`) in their project root:

```yaml
# .frankenbeast.yml
objective: "Build the feature described in FEATURE.md"
model: claude-sonnet

providers:
  - name: claude
    type: claude-cli
  - name: anthropic
    type: anthropic-api
    # apiKey resolved from ANTHROPIC_API_KEY env var
  - name: codex
    type: codex-cli

security:
  profile: standard
  allowedDomains:
    - github.com
    - linear.app

skills:
  - github
  - linear
  - code-review

reflection: true

brain:
  dbPath: .frankenbeast/brain.db

comms:
  enabled: true
  channels:
    slack:
      enabled: true
```

### Zod Schemas

```typescript
// packages/franken-orchestrator/src/cli/run-config-schema.ts

import { z } from 'zod';

export const ProviderTypeSchema = z.enum([
  'claude-cli', 'codex-cli', 'gemini-cli',
  'anthropic-api', 'openai-api', 'gemini-api',
]);

export const ProviderConfigSchema = z.object({
  name: z.string().min(1),
  type: ProviderTypeSchema,
  apiKey: z.string().optional(),
  cliPath: z.string().optional(),
});

export const SecurityConfigInputSchema = z.object({
  profile: z.enum(['strict', 'standard', 'permissive']).default('standard'),
  injectionDetection: z.boolean().optional(),
  piiMasking: z.boolean().optional(),
  outputValidation: z.boolean().optional(),
  allowedDomains: z.array(z.string()).optional(),
  maxTokenBudget: z.number().positive().optional(),
  requireApproval: z.enum(['all', 'destructive', 'none']).optional(),
});

export const CritiqueConfigSchema = z.object({
  evaluators: z.array(z.string()).optional(),
});

export const BrainConfigSchema = z.object({
  dbPath: z.string().optional(),
});

// Imported from Phase 4.5.04
export const CommsRunConfigSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().default('127.0.0.1'),
  port: z.number().default(3200),
  channels: z.object({
    slack: z.object({
      enabled: z.boolean().default(false),
      tokenRef: z.string().default('SLACK_BOT_TOKEN'),
      signingSecretRef: z.string().default('SLACK_SIGNING_SECRET'),
    }).default({}),
    discord: z.object({
      enabled: z.boolean().default(false),
      tokenRef: z.string().default('DISCORD_BOT_TOKEN'),
      publicKeyRef: z.string().default('DISCORD_PUBLIC_KEY'),
    }).default({}),
    telegram: z.object({
      enabled: z.boolean().default(false),
      botTokenRef: z.string().default('TELEGRAM_BOT_TOKEN'),
    }).default({}),
    whatsapp: z.object({
      enabled: z.boolean().default(false),
      accessTokenRef: z.string().default('WHATSAPP_ACCESS_TOKEN'),
      phoneNumberIdRef: z.string().default('WHATSAPP_PHONE_NUMBER_ID'),
      appSecretRef: z.string().default('WHATSAPP_APP_SECRET'),
      verifyTokenRef: z.string().default('WHATSAPP_VERIFY_TOKEN'),
    }).default({}),
  }).default({}),
});

export const RunConfigSchema = z.object({
  // Pre-existing fields
  objective: z.string().optional(),
  model: z.string().optional(),
  maxDurationMs: z.number().positive().optional(),
  skills: z.array(z.string()).optional(),
  maxTotalTokens: z.number().positive().optional(),

  // Consolidation fields
  runId: z.string().optional(),
  providers: z.array(ProviderConfigSchema).optional(),
  security: SecurityConfigInputSchema.optional(),
  critique: CritiqueConfigSchema.optional(),
  reflection: z.boolean().optional(),
  brain: BrainConfigSchema.optional(),
  comms: CommsRunConfigSchema.optional(),
  skillsDir: z.string().optional(),
  maxTokens: z.number().positive().optional(),
});

export type RunConfigInput = z.input<typeof RunConfigSchema>;
```

### Loader Updates

```typescript
// packages/franken-orchestrator/src/cli/run-config-loader.ts (updated)

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { RunConfigSchema } from './run-config-schema.js';
import type { RunConfig } from './run-config-schema.js';

const CONFIG_FILES = [
  '.frankenbeast.yml',
  '.frankenbeast.yaml',
  '.frankenbeast.json',
  'frankenbeast.config.json',
];

/**
 * Load RunConfig with precedence: CLI flags > env vars > config file > defaults
 */
export function loadRunConfig(
  cliFlags: Partial<RunConfig> = {},
  cwd: string = process.cwd(),
): RunConfig {
  // 1. Load config file (if exists)
  const fileConfig = loadConfigFile(cwd);

  // 2. Load env var overrides
  const envConfig = loadEnvOverrides();

  // 3. Merge with precedence: CLI > env > file > defaults
  const merged = {
    ...fileConfig,
    ...envConfig,
    ...stripUndefined(cliFlags),
  };

  // 4. Validate with Zod
  const result = RunConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid run config:\n${issues}`);
  }

  return result.data;
}

function loadConfigFile(cwd: string): Partial<RunConfig> {
  for (const filename of CONFIG_FILES) {
    const filepath = resolve(cwd, filename);
    if (existsSync(filepath)) {
      const raw = readFileSync(filepath, 'utf-8');
      if (filename.endsWith('.json')) {
        return JSON.parse(raw);
      }
      return parseYaml(raw) ?? {};
    }
  }
  return {};
}

function loadEnvOverrides(): Partial<RunConfig> {
  const overrides: Partial<RunConfig> = {};

  // Provider API keys from env
  if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY) {
    // Env vars are resolved at provider construction time (dep-factory),
    // not here. This is just for documentation.
  }

  // Security profile override
  const profile = process.env.FRANKENBEAST_SECURITY_PROFILE;
  if (profile === 'strict' || profile === 'standard' || profile === 'permissive') {
    overrides.security = { profile };
  }

  return overrides;
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  );
}
```

### CLI Flag Mapping

The existing CLI parser (in `cli.ts` or `run.ts`) maps flags to `RunConfig` fields:

| CLI Flag | RunConfig Field |
|----------|----------------|
| `--provider <type>` | `providers: [{ name: type, type }]` |
| `--security <profile>` | `security: { profile }` |
| `--reflection` | `reflection: true` |
| `--skills-dir <path>` | `skillsDir: path` |
| `--brain-db <path>` | `brain: { dbPath: path }` |
| `--max-tokens <n>` | `maxTokens: n` |
| `--max-budget <n>` | `security: { maxTokenBudget: n }` |
| `--comms` | `comms: { enabled: true }` |
| `--comms-port <n>` | `comms: { enabled: true, port: n }` |
| `--slack` | `comms: { enabled: true, channels: { slack: { enabled: true } } }` |

These are additive to existing flags (`--objective`, `--model`, `--max-duration`).

### Defaults

When no config file exists and no CLI flags are provided:

```typescript
const DEFAULTS: Partial<RunConfig> = {
  security: { profile: 'standard' },
  skillsDir: './skills',
  reflection: false,
  brain: { dbPath: ':memory:' },
  comms: { enabled: false },
};
```

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/cli/run-config-loader.test.ts

describe('RunConfigSchema', () => {
  it('validates minimal config (empty object)', () => {
    expect(RunConfigSchema.safeParse({}).success).toBe(true);
  });

  it('validates full config with all fields', () => {
    const full = {
      objective: 'test',
      providers: [{ name: 'claude', type: 'claude-cli' }],
      security: { profile: 'strict', allowedDomains: ['github.com'] },
      skills: ['github'],
      reflection: true,
      brain: { dbPath: './brain.db' },
    };
    expect(RunConfigSchema.safeParse(full).success).toBe(true);
  });

  it('rejects invalid provider type', () => {
    const bad = { providers: [{ name: 'x', type: 'invalid-provider' }] };
    expect(RunConfigSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid security profile', () => {
    const bad = { security: { profile: 'ultra-secure' } };
    expect(RunConfigSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative maxTokens', () => {
    const bad = { maxTokens: -100 };
    expect(RunConfigSchema.safeParse(bad).success).toBe(false);
  });

  it('defaults security profile to standard', () => {
    const result = RunConfigSchema.parse({ security: {} });
    expect(result.security!.profile).toBe('standard');
  });
});

describe('loadRunConfig()', () => {
  it('loads YAML config file', () => {
    // Mock fs to return YAML content
    const config = loadRunConfig({}, '/mock/project');
    expect(config).toBeDefined();
  });

  it('loads JSON config file', () => {
    // Mock fs to return JSON content
    const config = loadRunConfig({}, '/mock/project');
    expect(config).toBeDefined();
  });

  it('CLI flags override file config', () => {
    // Mock fs with { reflection: false }
    const config = loadRunConfig({ reflection: true }, '/mock/project');
    expect(config.reflection).toBe(true);
  });

  it('env vars override file config', () => {
    // Mock env with FRANKENBEAST_SECURITY_PROFILE=strict
    // Mock fs with { security: { profile: 'permissive' } }
    const config = loadRunConfig({}, '/mock/project');
    expect(config.security!.profile).toBe('strict');
  });

  it('throws with descriptive error on invalid config', () => {
    expect(() => loadRunConfig({
      providers: [{ name: 'x', type: 'bad' as any }],
    })).toThrow(/Invalid run config/);
  });

  it('returns empty config when no file exists and no flags', () => {
    const config = loadRunConfig({}, '/nonexistent');
    expect(config).toBeDefined();
  });
});
```

## Dependencies

Add `yaml` package to `franken-orchestrator`:

```json
{
  "dependencies": {
    "yaml": "^2.x"
  }
}
```

## Files

- **Add:** `packages/franken-orchestrator/src/cli/run-config-schema.ts` — Zod schemas
- **Modify:** `packages/franken-orchestrator/src/cli/run-config-loader.ts` — YAML/JSON loading, env overrides, precedence, validation
- **Modify:** `packages/franken-orchestrator/src/cli/cli.ts` or `run.ts` — add new CLI flag mappings
- **Add:** `packages/franken-orchestrator/tests/unit/cli/run-config-loader.test.ts`
- **Modify:** `packages/franken-orchestrator/package.json` — add `yaml` dependency

## Exit Criteria

- `RunConfigSchema` validates all consolidation fields with Zod
- `.frankenbeast.yml` / `.frankenbeast.yaml` / `.frankenbeast.json` loaded and parsed
- Precedence: CLI flags > env vars > config file > defaults
- Invalid config produces human-readable error with field paths
- All new CLI flags mapped to RunConfig fields
- Security profile defaults to `standard`
- All tests pass
