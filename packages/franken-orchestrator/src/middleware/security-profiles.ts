import { z } from 'zod';
import { MiddlewareChain, type LlmMiddleware } from './llm-middleware.js';
import { InjectionDetectionMiddleware } from './injection-detection.js';
import { PiiMaskingMiddleware } from './pii-masking.js';
import { OutputValidationMiddleware } from './output-validation.js';
import { CustomRuleMiddleware } from './custom-rule.js';

export type SecurityProfile = 'strict' | 'standard' | 'permissive';

export interface SecurityRule {
  name: string;
  pattern: string;
  action: 'block' | 'warn' | 'log';
  target: 'request' | 'response' | 'both';
}

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

export const SecurityConfigSchema = z.object({
  profile: z.enum(['strict', 'standard', 'permissive']),
  injectionDetection: z.boolean(),
  piiMasking: z.boolean(),
  outputValidation: z.boolean(),
  allowedDomains: z.array(z.string()).optional(),
  maxTokenBudget: z.number().positive().optional(),
  requireApproval: z.enum(['all', 'destructive', 'none']),
  customRules: z
    .array(
      z.object({
        name: z.string().min(1),
        pattern: z.string().min(1),
        action: z.enum(['block', 'warn', 'log']),
        target: z.enum(['request', 'response', 'both']),
      }),
    )
    .optional(),
});

export const PROFILE_DEFAULTS: Record<SecurityProfile, SecurityConfig> = {
  strict: {
    profile: 'strict',
    injectionDetection: true,
    piiMasking: true,
    outputValidation: true,
    allowedDomains: [],
    requireApproval: 'all',
  },
  standard: {
    profile: 'standard',
    injectionDetection: true,
    piiMasking: true,
    outputValidation: true,
    requireApproval: 'destructive',
  },
  permissive: {
    profile: 'permissive',
    injectionDetection: false,
    piiMasking: false,
    outputValidation: true,
    requireApproval: 'none',
  },
};

export function resolveSecurityConfig(
  profile: SecurityProfile,
  overrides?: Partial<Omit<SecurityConfig, 'profile'>>,
): SecurityConfig {
  return {
    ...PROFILE_DEFAULTS[profile],
    ...overrides,
    profile,
  };
}

export function buildMiddlewareChain(config: SecurityConfig): MiddlewareChain {
  const chain = new MiddlewareChain();

  if (config.injectionDetection) {
    const tier = config.profile === 'strict' ? 'strict' : 'standard';
    chain.add(new InjectionDetectionMiddleware(tier));
  }

  if (config.piiMasking) {
    chain.add(new PiiMaskingMiddleware());
  }

  if (config.outputValidation) {
    chain.add(new OutputValidationMiddleware());
  }

  if (config.customRules) {
    for (const rule of config.customRules) {
      chain.add(new CustomRuleMiddleware(rule));
    }
  }

  return chain;
}
