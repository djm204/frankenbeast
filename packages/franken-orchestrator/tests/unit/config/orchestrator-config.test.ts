import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
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
      expect(config.allowCrossProfileStateAccess).toBe(false);
    });
  });

  describe('cross-profile state access', () => {
    const priorProfile = process.env.HERMES_PROFILE;
    const tmpDirs: string[] = [];

    afterEach(() => {
      if (priorProfile === undefined) {
        delete process.env.HERMES_PROFILE;
      } else {
        process.env.HERMES_PROFILE = priorProfile;
      }
      for (const dir of tmpDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rejects stateDir values that target another Hermes profile by default', () => {
      process.env.HERMES_PROFILE = 'default';
      const result = OrchestratorConfigSchema.safeParse({
        stateDir: join('/srv/hermes', '.hermes', 'profiles', 'prod', 'state'),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['stateDir']);
        expect(result.error.issues[0]?.message).toContain('Cross-profile state access is denied by default');
      }
    });

    it('allows explicit cross-profile state access only when the operator opts in', () => {
      process.env.HERMES_PROFILE = 'default';
      const result = OrchestratorConfigSchema.parse({
        stateDir: join('/srv/hermes', '.hermes', 'profiles', 'prod', 'state'),
        allowCrossProfileStateAccess: true,
      });

      expect(result.stateDir).toContain(join('.hermes', 'profiles', 'prod', 'state'));
      expect(result.allowCrossProfileStateAccess).toBe(true);
    });

    it('rejects symlinked stateDir values that resolve into another Hermes profile', () => {
      process.env.HERMES_PROFILE = 'default';
      const root = join(tmpdir(), `franken-state-symlink-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      tmpDirs.push(root);
      const target = join(root, '.hermes', 'profiles', 'prod', 'state');
      const link = join(root, 'repo', '.fbeast', 'state');
      mkdirSync(target, { recursive: true });
      mkdirSync(join(root, 'repo', '.fbeast'), { recursive: true });
      symlinkSync(target, link, 'dir');

      const result = OrchestratorConfigSchema.safeParse({ stateDir: link });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['stateDir']);
        expect(result.error.issues[0]?.message).toContain("Hermes profile 'prod'");
      }
    });

    it('rejects stateDir children under symlinked ancestors that resolve into another profile', () => {
      process.env.HERMES_PROFILE = 'default';
      const root = join(
        tmpdir(),
        `franken-state-symlink-child-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      tmpDirs.push(root);
      const target = join(root, '.hermes', 'profiles', 'prod');
      const link = join(root, 'repo', '.fbeast', 'state-link');
      mkdirSync(target, { recursive: true });
      mkdirSync(join(root, 'repo', '.fbeast'), { recursive: true });
      symlinkSync(target, link, 'dir');

      const result = OrchestratorConfigSchema.safeParse({ stateDir: join(link, 'state') });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['stateDir']);
        expect(result.error.issues[0]?.message).toContain("Hermes profile 'prod'");
      }
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

    it('accepts security custom rules in config', () => {
      const result = OrchestratorConfigSchema.parse({
        security: {
          customRules: [
            { name: 'no-credentials', pattern: 'credential', action: 'block', target: 'request' },
          ],
        },
      });

      expect(result.security?.customRules).toEqual([
        { name: 'no-credentials', pattern: 'credential', action: 'block', target: 'request' },
      ]);
    });

    it('rejects malformed security custom rules', () => {
      const result = OrchestratorConfigSchema.safeParse({
        security: {
          customRules: [{ name: 'bad-regex', pattern: '[', action: 'block', target: 'request' }],
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

    it('applies network plaintext endpoint validation to the full orchestrator config', () => {
      expect(() => OrchestratorConfigSchema.parse({
        chat: { enabled: false, host: '0.0.0.0' },
      })).toThrow(/loopback-only/);

      expect(() => OrchestratorConfigSchema.parse({
        comms: { slack: { enabled: true }, orchestratorWsUrl: 'ws://internal-service:3737/v1/chat/ws' },
      })).toThrow(/wss:\/\//);
    });
  });
});
