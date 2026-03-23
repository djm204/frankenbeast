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
    const body = await c.req.json();
    const raw = SecurityConfigSchema.partial().parse(body);
    // Strip undefined values so exactOptionalPropertyTypes is satisfied
    const parsed = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== undefined),
    ) as Partial<SecurityConfig>;

    if (parsed.profile) {
      const resolved = resolveSecurityConfig(parsed.profile, parsed);
      deps.setSecurityConfig(resolved);
    } else {
      deps.setSecurityConfig(parsed);
    }

    return c.json(deps.getSecurityConfig());
  });

  return app;
}
