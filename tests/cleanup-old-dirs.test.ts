import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const OLD_MODULE_DIRS = [
  'franken-brain',
  'franken-critique',
  'franken-governor',
  'franken-heartbeat',
  'franken-mcp',
  'franken-observer',
  'franken-orchestrator',
  'franken-planner',
  'franken-skills',
  'franken-types',
  'frankenfirewall',
] as const;

describe('Chunk 04: cleanup old module directories', () => {
  describe('old root-level module directories are removed', () => {
    for (const dir of OLD_MODULE_DIRS) {
      it(`${dir}/ should not exist at root level`, () => {
        expect(existsSync(resolve(ROOT, dir))).toBe(false);
      });
    }
  });

  describe('temp clone directory is removed', () => {
    it('/tmp/frankenbeast-migrate/ should not exist', () => {
      expect(existsSync('/tmp/frankenbeast-migrate')).toBe(false);
    });
  });

  describe('all module code lives exclusively under packages/', () => {
    for (const dir of OLD_MODULE_DIRS) {
      it(`packages/${dir}/ should exist`, () => {
        expect(existsSync(resolve(ROOT, 'packages', dir))).toBe(true);
      });
    }
  });
});
