import { describe, it, expect } from 'vitest';
import { OrchestratorConfigSchema, defaultConfig } from '../../../src/config/orchestrator-config.js';

describe('OrchestratorConfig', () => {
  describe('defaults', () => {
    it('provides sensible defaults', () => {
      const config = defaultConfig();
      expect(config.maxCritiqueIterations).toBe(3);
      expect(config.maxTotalTokens).toBe(100_000);
      expect(config.maxDurationMs).toBe(300_000);
      expect(config.enableHeartbeat).toBe(true);
      expect(config.enableTracing).toBe(true);
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
      expect(result.enableHeartbeat).toBe(true); // default preserved
    });

    it('rejects out-of-range critique iterations', () => {
      expect(() =>
        OrchestratorConfigSchema.parse({ maxCritiqueIterations: 0 }),
      ).toThrow();
      expect(() =>
        OrchestratorConfigSchema.parse({ maxCritiqueIterations: 11 }),
      ).toThrow();
    });

    it('rejects negative token budget', () => {
      expect(() =>
        OrchestratorConfigSchema.parse({ maxTotalTokens: -1 }),
      ).toThrow();
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
