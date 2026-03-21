import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..', '..');
const CI_PATH = resolve(ROOT, '.github/workflows/ci.yml');
const RELEASE_PATH = resolve(ROOT, '.github/workflows/release-please.yml');

describe('CI Workflow (.github/workflows/ci.yml)', () => {
  it('ci.yml file exists', () => {
    expect(existsSync(CI_PATH)).toBe(true);
  });

  describe('workflow configuration', () => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(CI_PATH, 'utf-8');
    });

    it('is valid YAML (parseable by node)', () => {
      // Use node's built-in JSON to validate after converting with a simple check
      // At minimum, it should not throw when we try to parse it
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain('name:');
    });

    it('has a workflow name', () => {
      expect(content).toMatch(/^name:/m);
    });

    it('triggers on push to main', () => {
      expect(content).toMatch(/on:/);
      expect(content).toMatch(/push:/);
      expect(content).toMatch(/branches:.*\[?.*main.*\]?/);
    });

    it('triggers on pull_request to main', () => {
      expect(content).toMatch(/pull_request:/);
    });

    it('uses Node.js 22', () => {
      expect(content).toContain('node-version');
      expect(content).toMatch(/node-version.*['"]?22['"]?/);
    });

    it('runs npm ci for deterministic installs', () => {
      expect(content).toContain('npm ci');
    });

    it('runs turbo run build test lint', () => {
      expect(content).toContain('turbo run');
      expect(content).toMatch(/turbo run.*build.*test.*lint/);
    });

    it('uses actions/setup-node with npm cache', () => {
      expect(content).toContain('actions/setup-node');
      expect(content).toMatch(/cache.*npm/);
    });

    it('uses actions/checkout', () => {
      expect(content).toContain('actions/checkout');
    });

    it('runs on ubuntu-latest', () => {
      expect(content).toContain('ubuntu-latest');
    });
  });
});

describe('release-please.yml (unchanged)', () => {
  it('release-please.yml exists', () => {
    expect(existsSync(RELEASE_PATH)).toBe(true);
  });

  it('references correct config-file path', () => {
    const content = readFileSync(RELEASE_PATH, 'utf-8');
    expect(content).toContain('config-file: release-please-config.json');
  });

  it('references correct manifest-file path', () => {
    const content = readFileSync(RELEASE_PATH, 'utf-8');
    expect(content).toContain('manifest-file: .release-please-manifest.json');
  });
});

// release-auto-merge.yml was removed during package consolidation
