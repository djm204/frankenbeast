import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillAuthResolver, MissingCredentialError } from '../../../src/skills/skill-auth.js';

describe('SkillAuthResolver', () => {
  let tempDir: string;
  let resolver: SkillAuthResolver;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'auth-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env['TEST_TOKEN'];
  });

  function createEnvFile(content: string) {
    mkdirSync(join(tempDir, '.frankenbeast'), { recursive: true });
    writeFileSync(join(tempDir, '.frankenbeast', '.env'), content);
  }

  describe('resolve()', () => {
    it('resolves ${VAR} from .frankenbeast/.env', () => {
      createEnvFile('GITHUB_TOKEN=ghp_abc123');
      resolver = new SkillAuthResolver(tempDir);
      expect(resolver.resolve('${GITHUB_TOKEN}')).toBe('ghp_abc123');
    });

    it('falls back to process.env', () => {
      resolver = new SkillAuthResolver(tempDir);
      process.env['TEST_TOKEN'] = 'from-env';
      expect(resolver.resolve('${TEST_TOKEN}')).toBe('from-env');
    });

    it('throws MissingCredentialError for unresolved vars', () => {
      resolver = new SkillAuthResolver(tempDir);
      expect(() => resolver.resolve('${NONEXISTENT}')).toThrow(MissingCredentialError);
    });

    it('resolves multiple vars in one string', () => {
      createEnvFile('USER=alice\nPASS=secret');
      resolver = new SkillAuthResolver(tempDir);
      expect(resolver.resolve('${USER}:${PASS}')).toBe('alice:secret');
    });

    it('passes through strings without placeholders', () => {
      resolver = new SkillAuthResolver(tempDir);
      expect(resolver.resolve('plain-value')).toBe('plain-value');
    });
  });

  describe('resolveConfig()', () => {
    it('resolves all env vars in a config object', () => {
      createEnvFile('GITHUB_TOKEN=ghp_test');
      resolver = new SkillAuthResolver(tempDir);
      const result = resolver.resolveConfig({
        GITHUB_TOKEN: '${GITHUB_TOKEN}',
        STATIC: 'literal',
      });
      expect(result).toEqual({
        GITHUB_TOKEN: 'ghp_test',
        STATIC: 'literal',
      });
    });
  });

  describe('checkCredentials()', () => {
    it('reports available/missing credentials', () => {
      createEnvFile('GITHUB_TOKEN=ghp_test');
      resolver = new SkillAuthResolver(tempDir);
      const result = resolver.checkCredentials({
        GITHUB_TOKEN: '${GITHUB_TOKEN}',
        LINEAR_KEY: '${LINEAR_KEY}',
      });
      expect(result).toEqual([
        { var: 'GITHUB_TOKEN', available: true },
        { var: 'LINEAR_KEY', available: false },
      ]);
    });
  });

  describe('loadDotEnv()', () => {
    it('strips quotes from values', () => {
      createEnvFile('TOKEN="quoted-value"\nSINGLE=\'single\'');
      resolver = new SkillAuthResolver(tempDir);
      expect(resolver.resolve('${TOKEN}')).toBe('quoted-value');
      expect(resolver.resolve('${SINGLE}')).toBe('single');
    });

    it('ignores comments and blank lines', () => {
      createEnvFile('# comment\n\nTOKEN=abc\n  # another comment');
      resolver = new SkillAuthResolver(tempDir);
      expect(resolver.resolve('${TOKEN}')).toBe('abc');
    });

    it('returns empty when .env missing', () => {
      resolver = new SkillAuthResolver(tempDir);
      // Should not throw — just has no overrides
      process.env['TEST_TOKEN'] = 'fallback';
      expect(resolver.resolve('${TEST_TOKEN}')).toBe('fallback');
    });
  });
});
