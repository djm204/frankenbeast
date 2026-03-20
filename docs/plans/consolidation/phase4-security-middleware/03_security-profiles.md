# Chunk 4.3: Security Profiles + API Routes

**Phase:** 4 — Security Middleware
**Depends on:** Chunk 4.2 (middleware implementations)
**Estimated size:** Medium (~150 lines + tests)

---

## Purpose

Implement configurable security profiles (strict/standard/permissive) that control which middleware is active. Expose via API routes for dashboard configuration and run config for CLI configuration.

## Implementation

### Security Config

```typescript
// packages/franken-orchestrator/src/middleware/security-profiles.ts

import { z } from 'zod';

export type SecurityProfile = 'strict' | 'standard' | 'permissive';

export interface SecurityConfig {
  profile: SecurityProfile;
  injectionDetection: boolean;
  piiMasking: boolean;
  outputValidation: boolean;
  allowedDomains?: string[];
  maxTokenBudget?: number;
  requireApproval: 'all' | 'destructive' | 'none';
  customRules?: SecurityRule[];
}

export interface SecurityRule {
  name: string;
  pattern: string;    // regex
  action: 'block' | 'warn' | 'log';
  target: 'request' | 'response' | 'both';
}

export const SecurityConfigSchema = z.object({
  profile: z.enum(['strict', 'standard', 'permissive']),
  injectionDetection: z.boolean(),
  piiMasking: z.boolean(),
  outputValidation: z.boolean(),
  allowedDomains: z.array(z.string()).optional(),
  maxTokenBudget: z.number().positive().optional(),
  requireApproval: z.enum(['all', 'destructive', 'none']),
  customRules: z.array(z.object({
    name: z.string().min(1),
    pattern: z.string().min(1),
    action: z.enum(['block', 'warn', 'log']),
    target: z.enum(['request', 'response', 'both']),
  })).optional(),
});

/** Built-in profile defaults */
export const PROFILE_DEFAULTS: Record<SecurityProfile, SecurityConfig> = {
  strict: {
    profile: 'strict',
    injectionDetection: true,
    piiMasking: true,
    outputValidation: true,
    allowedDomains: [],       // must be explicitly populated
    maxTokenBudget: undefined, // must be explicitly set
    requireApproval: 'all',
  },
  standard: {
    profile: 'standard',
    injectionDetection: true,
    piiMasking: true,
    outputValidation: true,
    allowedDomains: undefined,  // optional
    maxTokenBudget: undefined,  // optional
    requireApproval: 'destructive',
  },
  permissive: {
    profile: 'permissive',
    injectionDetection: false,
    piiMasking: false,
    outputValidation: true,
    allowedDomains: undefined,
    maxTokenBudget: undefined,
    requireApproval: 'none',
  },
};

/**
 * Resolve a security config from a profile + per-setting overrides.
 * Overrides take precedence over profile defaults.
 */
export function resolveSecurityConfig(
  profile: SecurityProfile,
  overrides?: Partial<Omit<SecurityConfig, 'profile'>>,
): SecurityConfig {
  return {
    ...PROFILE_DEFAULTS[profile],
    ...overrides,
    profile,  // profile field always matches the selected profile
  };
}

/**
 * Build a MiddlewareChain from a SecurityConfig.
 */
export function buildMiddlewareChain(config: SecurityConfig): MiddlewareChain {
  const chain = new MiddlewareChain();
  if (config.injectionDetection) {
    chain.add(new InjectionDetectionMiddleware());
  }
  if (config.piiMasking) {
    chain.add(new PiiMaskingMiddleware());
  }
  if (config.outputValidation) {
    chain.add(new OutputValidationMiddleware());
  }
  // Custom rules become additional middleware instances
  if (config.customRules) {
    for (const rule of config.customRules) {
      chain.add(new CustomRuleMiddleware(rule));
    }
  }
  return chain;
}
```

### API Routes

```typescript
// packages/franken-orchestrator/src/http/routes/security-routes.ts

import { Hono } from 'hono';

export function createSecurityRoutes(deps: {
  getSecurityConfig: () => SecurityConfig;
  setSecurityConfig: (config: Partial<SecurityConfig>) => void;
}): Hono {
  const app = new Hono();

  // GET /api/security — current config + isCustomized flag
  app.get('/', (c) => {
    const config = deps.getSecurityConfig();
    const defaults = PROFILE_DEFAULTS[config.profile];
    const isCustomized =
      config.injectionDetection !== defaults.injectionDetection ||
      config.piiMasking !== defaults.piiMasking ||
      config.outputValidation !== defaults.outputValidation ||
      config.requireApproval !== defaults.requireApproval;
    return c.json({ ...config, isCustomized });
  });

  // PATCH /api/security — update profile or individual settings
  app.patch('/', async (c) => {
    const body = await c.req.json();
    const parsed = SecurityConfigSchema.partial().parse(body);

    // If profile changed, start from profile defaults then apply overrides
    if (parsed.profile) {
      const resolved = resolveSecurityConfig(parsed.profile, parsed);
      deps.setSecurityConfig(resolved);
    } else {
      // Just override individual settings
      deps.setSecurityConfig(parsed);
    }

    return c.json(deps.getSecurityConfig());
  });

  return app;
}
```

### Run Config Integration

The run config already supports a `security` field (added during brainstorming). Wire it:

```yaml
# .frankenbeast/run-config.yaml
security:
  profile: standard
  piiMasking: false        # override: disable PII masking for this run
  requireApproval: none    # override: no HITL for this run
```

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/middleware/security-profiles.test.ts

describe('SecurityProfiles', () => {
  describe('PROFILE_DEFAULTS', () => {
    it('strict enables all guards', () => { ... });
    it('standard enables injection + PII, destructive approval', () => { ... });
    it('permissive only enables output validation', () => { ... });
  });

  describe('resolveSecurityConfig()', () => {
    it('returns profile defaults with no overrides', () => { ... });
    it('applies per-setting overrides', () => { ... });
    it('override does not change profile field', () => { ... });
  });

  describe('buildMiddlewareChain()', () => {
    it('strict profile creates 3 middleware', () => { ... });
    it('permissive profile creates 1 middleware (output only)', () => { ... });
    it('adds custom rule middleware', () => { ... });
  });
});

// packages/franken-orchestrator/tests/integration/middleware/security-routes.test.ts

describe('Security API routes', () => {
  it('GET /api/security returns current config', () => { ... });
  it('PATCH /api/security with profile switches all defaults', () => { ... });
  it('PATCH /api/security with individual override', () => { ... });
  it('PATCH /api/security validates input schema', () => { ... });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/middleware/security-profiles.ts`
- **Add:** `packages/franken-orchestrator/src/http/routes/security-routes.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/middleware/security-profiles.test.ts`
- **Add:** `packages/franken-orchestrator/tests/integration/middleware/security-routes.test.ts`

## Exit Criteria

- Three security profiles defined with correct defaults
- `resolveSecurityConfig()` merges profile + overrides
- `buildMiddlewareChain()` creates correct middleware for each profile
- API routes: GET returns config, PATCH updates it
- Run config `security:` field is parsed and applied
- Tests cover all profiles, overrides, and API routes
