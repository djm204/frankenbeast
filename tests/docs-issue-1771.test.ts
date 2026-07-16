import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const manifestPath = 'docs/onboarding/local-service-dependencies.manifest.json';
const guidePath = 'docs/onboarding/local-service-dependencies.md';

type LocalService = {
  id: string;
  name: string;
  requiredFor: string[];
  notRequiredFor: string[];
  startCommand: string;
  healthCheck: string;
  env: string[];
  failureSymptom: string;
  handoffNote: string;
};

type LocalServiceManifest = {
  schemaVersion: number;
  defaultPolicy: string;
  services: LocalService[];
  edgeCases: Array<{ case: string; expectedAction: string }>;
};

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function readManifest(): LocalServiceManifest {
  return JSON.parse(readText(manifestPath)) as LocalServiceManifest;
}

describe('issue #1771 local service dependency explainer', () => {
  it('adds a deterministic manifest for local service dependencies and handoffs', () => {
    const manifest = readManifest();

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.defaultPolicy).toContain('Most local services are optional');

    const serviceIds = manifest.services.map((service) => service.id);
    expect(serviceIds).toEqual(['chromadb', 'grafana', 'tempo', 'provider-cli', 'secret-backend']);
    expect(new Set(serviceIds).size).toBe(serviceIds.length);

    for (const service of manifest.services) {
      expect(service.id).toMatch(/^[a-z0-9-]+$/);
      expect(service.name.length).toBeGreaterThan(0);
      expect(service.requiredFor.length).toBeGreaterThan(0);
      expect(service.notRequiredFor.length).toBeGreaterThan(0);
      expect(service.startCommand.length).toBeGreaterThan(0);
      expect(service.healthCheck.length).toBeGreaterThan(0);
      expect(service.failureSymptom.length).toBeGreaterThan(0);
      expect(service.handoffNote.length).toBeGreaterThan(0);
    }
  });

  it('documents optional-service edge cases so onboarding failures are explicit', () => {
    const manifest = readManifest();
    const guide = readText(guidePath);

    expect(manifest.edgeCases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          case: 'Docker is not installed',
          expectedAction: expect.stringContaining('npm run bootstrap -- --no-docker'),
        }),
        expect.objectContaining({
          case: 'Only root tests are failing',
          expectedAction: expect.stringContaining('Do not start optional compose services'),
        }),
        expect.objectContaining({
          case: 'A URL env var points to a remote service',
          expectedAction: expect.stringContaining('externally managed'),
        }),
      ]),
    );

    for (const requiredText of [
      '# Local service dependency explainer',
      'Do not start the full Docker stack just because a docs test, static typecheck, or CLI help command failed.',
      'Do not assume Docker is required for onboarding.',
      'Do not overwrite a remote service URL by starting a local container on the same port.',
      'Local service dependency check:',
    ]) {
      expect(guide).toContain(requiredText);
    }
  });

  it('links the explainer from the onboarding and quickstart entrypoints', () => {
    const onboarding = readText('ONBOARDING.md');
    const quickstart = readText('docs/guides/quickstart.md');

    expect(onboarding).toContain('[local service dependency explainer](docs/onboarding/local-service-dependencies.md)');
    expect(onboarding).toContain('Before starting Docker or blocking on optional infrastructure');
    expect(quickstart).toContain('[local service dependency explainer](../onboarding/local-service-dependencies.md)');
    expect(quickstart).toContain('which services are optional and how to health-check them');
  });
});
