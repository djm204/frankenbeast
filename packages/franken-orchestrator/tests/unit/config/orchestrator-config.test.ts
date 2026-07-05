import { describe, it, expect } from 'vitest';
import { OrchestratorConfigSchema, defaultConfig } from '../../../src/config/orchestrator-config.js';

describe('OrchestratorConfig', () => {
  describe('defaults', () => {
    it('provides sensible defaults', () => {
      const config = defaultConfig();
      expect(config.maxCritiqueIterations).toBe(3);
      expect(config.maxTotalTokens).toBe(100_000);
      expect(config.maxDurationMs).toBe(300_000);
      expect(config.enableHeartbeat).toBe(false);
      expect(config.enableTracing).toBe(false);
      expect(config.minCritiqueScore).toBe(0.7);
    });
  });

  describe('validation', () => {
    it('accepts valid partial overrides', () => {
      const result = OrchestratorConfigSchema.parse({
        maxCritiqueIterations: 5,
        maxTotalTokens: 50_000,
      });
      expect(result.maxCritiqueIterations).toBe(5);
      expect(result.maxTotalTokens).toBe(50_000);
      expect(result.enableHeartbeat).toBe(false); // secure default preserved
    });

    it('accepts explicit local-only webhook signature override in security config', () => {
      const result = OrchestratorConfigSchema.parse({
        security: {
          profile: 'permissive',
          webhookSignaturePolicy: 'local-dev-unsigned',
        },
      });

      expect(result.security?.profile).toBe('permissive');
      expect(result.security?.webhookSignaturePolicy).toBe('local-dev-unsigned');
    });

    it('rejects invalid webhook signature policies', () => {
      const result = OrchestratorConfigSchema.safeParse({
        security: {
          webhookSignaturePolicy: 'disabled',
        },
      });

      expect(result.success).toBe(false);
    });

    it('rejects out-of-range critique iterations', () => {
      expect(() =>
        OrchestratorConfigSchema.parse({ maxCritiqueIterations: 0 }),
      ).toThrow();
      expect(() =>
        OrchestratorConfigSchema.parse({ maxCritiqueIterations: 11 }),
      ).toThrow();
    });

    it('rejects token budgets too small for a single request', () => {
      const result = OrchestratorConfigSchema.safeParse({ maxTotalTokens: 9_999 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['maxTotalTokens']);
        expect(result.error.issues[0]?.message).toContain('at least 10000');
      }
    });

    it('rejects critique scores that cannot pass', () => {
      const result = OrchestratorConfigSchema.safeParse({ minCritiqueScore: 1 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['minCritiqueScore']);
        expect(result.error.issues[0]?.message).toContain('less than 1');
      }
    });

    it('rejects durations too short to accommodate critique iterations', () => {
      const result = OrchestratorConfigSchema.safeParse({
        maxCritiqueIterations: 3,
        maxDurationMs: 20_000,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['maxDurationMs']);
        expect(result.error.issues[0]?.message).toContain(
          'at least 30000ms for 3 critique iterations',
        );
      }
    });

    it('rejects out-of-range critique score', () => {
      expect(() =>
        OrchestratorConfigSchema.parse({ minCritiqueScore: -0.1 }),
      ).toThrow();
      expect(() =>
        OrchestratorConfigSchema.parse({ minCritiqueScore: 1.1 }),
      ).toThrow();
    });

    it('accepts boundary values', () => {
      const result = OrchestratorConfigSchema.parse({
        maxCritiqueIterations: 1,
        minCritiqueScore: 0,
      });
      expect(result.maxCritiqueIterations).toBe(1);
      expect(result.minCritiqueScore).toBe(0);
    });
  });
});
