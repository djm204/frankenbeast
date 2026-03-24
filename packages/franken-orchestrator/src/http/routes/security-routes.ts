import { Hono } from 'hono';
import {
  PROFILE_DEFAULTS,
  resolveSecurityConfig,
  SecurityConfigSchema,
  type SecurityConfig,
} from '../../middleware/security-profiles.js';

export function createSecurityRoutes(deps: {
  getSecurityConfig: () => SecurityConfig;
  setSecurityConfig: (config: Partial<SecurityConfig>) => void;
}): Hono {
  const app = new Hono();

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

  app.patch('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    let raw;
    try {
      raw = SecurityConfigSchema.partial().parse(body);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Validation failed';
      return c.json({ error: message }, 400);
    }

    // Strip undefined values so exactOptionalPropertyTypes is satisfied
    const parsed = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== undefined),
    ) as Partial<SecurityConfig>;

    if (parsed.profile) {
      const resolved = resolveSecurityConfig(parsed.profile, parsed);
      // Reject strict profile without allowedDomains
      if (
        resolved.profile === 'strict' &&
        (!resolved.allowedDomains || resolved.allowedDomains.length === 0)
      ) {
        return c.json(
          {
            error:
              'Security profile "strict" requires allowedDomains to be configured',
          },
          400,
        );
      }
      deps.setSecurityConfig(resolved);
    } else {
      // If switching to strict via individual override, validate
      const current = deps.getSecurityConfig();
      const merged = { ...current, ...parsed };
      if (
        merged.profile === 'strict' &&
        (!merged.allowedDomains || merged.allowedDomains.length === 0)
      ) {
        return c.json(
          {
            error:
              'Security profile "strict" requires allowedDomains to be configured',
          },
          400,
        );
      }
      deps.setSecurityConfig(parsed);
    }

    return c.json(deps.getSecurityConfig());
  });

  return app;
}
