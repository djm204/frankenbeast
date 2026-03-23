import { describe, it, expect } from 'vitest';
import {
  PROFILE_DEFAULTS,
  resolveSecurityConfig,
  buildMiddlewareChain,
  type SecurityConfig,
  type SecurityProfile,
  SecurityConfigSchema,
} from '../../../src/middleware/security-profiles.js';

describe('SecurityProfiles', () => {
  describe('PROFILE_DEFAULTS', () => {
    it('strict enables all guards', () => {
      const s = PROFILE_DEFAULTS.strict;
      expect(s.injectionDetection).toBe(true);
      expect(s.piiMasking).toBe(true);
      expect(s.outputValidation).toBe(true);
      expect(s.requireApproval).toBe('all');
    });

    it('standard enables injection + PII, destructive approval', () => {
      const s = PROFILE_DEFAULTS.standard;
      expect(s.injectionDetection).toBe(true);
      expect(s.piiMasking).toBe(true);
      expect(s.outputValidation).toBe(true);
      expect(s.requireApproval).toBe('destructive');
    });

    it('permissive only enables output validation', () => {
      const s = PROFILE_DEFAULTS.permissive;
      expect(s.injectionDetection).toBe(false);
      expect(s.piiMasking).toBe(false);
      expect(s.outputValidation).toBe(true);
      expect(s.requireApproval).toBe('none');
    });
  });

  describe('resolveSecurityConfig()', () => {
    it('returns profile defaults with no overrides', () => {
      const config = resolveSecurityConfig('standard');
      expect(config).toEqual(PROFILE_DEFAULTS.standard);
    });

    it('applies per-setting overrides', () => {
      const config = resolveSecurityConfig('standard', { piiMasking: false });
      expect(config.piiMasking).toBe(false);
      expect(config.injectionDetection).toBe(true); // unchanged
    });

    it('override does not change profile field', () => {
      const config = resolveSecurityConfig('strict', { requireApproval: 'none' });
      expect(config.profile).toBe('strict');
      expect(config.requireApproval).toBe('none');
    });

    it('applies allowedDomains override', () => {
      const config = resolveSecurityConfig('standard', {
        allowedDomains: ['github.com'],
      });
      expect(config.allowedDomains).toEqual(['github.com']);
    });

    it('applies customRules override', () => {
      const config = resolveSecurityConfig('standard', {
        customRules: [{ name: 'no-sql', pattern: 'DROP TABLE', action: 'block', target: 'request' }],
      });
      expect(config.customRules).toHaveLength(1);
    });
  });

  describe('buildMiddlewareChain()', () => {
    it('strict profile creates 3 middleware (injection, pii, output)', () => {
      const config = resolveSecurityConfig('strict', {
        allowedDomains: ['github.com'],
      });
      const chain = buildMiddlewareChain(config);
      const names = chain.getMiddlewares().map((m) => m.name);
      expect(names).toContain('injection-detection');
      expect(names).toContain('pii-masking');
      expect(names).toContain('output-validation');
    });

    it('permissive profile creates 1 middleware (output only)', () => {
      const config = resolveSecurityConfig('permissive');
      const chain = buildMiddlewareChain(config);
      const names = chain.getMiddlewares().map((m) => m.name);
      expect(names).toEqual(['output-validation']);
    });

    it('adds custom rule middleware', () => {
      const config = resolveSecurityConfig('standard', {
        customRules: [
          { name: 'no-sql', pattern: 'DROP TABLE', action: 'block', target: 'request' },
        ],
      });
      const chain = buildMiddlewareChain(config);
      const names = chain.getMiddlewares().map((m) => m.name);
      expect(names).toContain('custom:no-sql');
    });
  });

  describe('SecurityConfigSchema', () => {
    it('validates a well-formed config', () => {
      const config: SecurityConfig = {
        profile: 'standard',
        injectionDetection: true,
        piiMasking: true,
        outputValidation: true,
        requireApproval: 'destructive',
      };
      expect(SecurityConfigSchema.parse(config)).toEqual(config);
    });

    it('rejects invalid profile', () => {
      expect(() =>
        SecurityConfigSchema.parse({ profile: 'invalid', injectionDetection: true, piiMasking: true, outputValidation: true, requireApproval: 'all' }),
      ).toThrow();
    });

    it('accepts optional fields', () => {
      const config = {
        profile: 'strict',
        injectionDetection: true,
        piiMasking: true,
        outputValidation: true,
        requireApproval: 'all',
        allowedDomains: ['github.com'],
        maxTokenBudget: 50000,
      };
      expect(SecurityConfigSchema.parse(config)).toEqual(config);
    });
  });
});
