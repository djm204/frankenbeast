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

    const chromadb = manifest.services.find((service) => service.id === 'chromadb');
    expect(chromadb).toMatchObject({
      startCommand: 'docker compose up -d chromadb',
      healthCheck: 'set -a; [ ! -f .env ] || . ./.env; set +a; curl -fsS "${CHROMA_URL:-http://localhost:8000}/api/v2/heartbeat"',
    });
    expect(chromadb?.requiredFor).not.toContain('memory-backed MCP workflows');
    expect(chromadb?.notRequiredFor).toContain('file-backed MCP memory');

    const secretBackend = manifest.services.find((service) => service.id === 'secret-backend');
    expect(secretBackend?.healthCheck).toContain("JSON.parse(fs.readFileSync('.fbeast/config.json'");
    expect(secretBackend?.healthCheck).toContain('createSecretStore');
    expect(secretBackend?.healthCheck).toContain('FRANKENBEAST_PASSPHRASE');
    expect(secretBackend?.healthCheck).toContain('store.detect()');
    expect(secretBackend?.healthCheck).toContain('store.resolve(ref)');
    expect(secretBackend?.healthCheck).toContain('cfg.comms?.telegram?.webhookSecretTokenRef');
    expect(secretBackend?.healthCheck).toContain('SecretResolver');
    expect(secretBackend?.healthCheck).toContain('.keys()');
    expect(secretBackend?.handoffNote).toContain('detect() succeeded');
    expect(secretBackend?.handoffNote).toContain('configured secret refs resolved through store.resolve()');
    expect(secretBackend?.healthCheck).not.toContain('|| true');

    const tempo = manifest.services.find((service) => service.id === 'tempo');
    expect(tempo?.healthCheck).toContain('http://localhost:3200/ready');
    expect(tempo?.healthCheck).toContain('net.connect(4318');
    expect(tempo?.handoffNote).toContain('OTLP/HTTP target 4318');

    const grafana = manifest.services.find((service) => service.id === 'grafana');
    expect(grafana?.startCommand).toContain('openssl rand -base64 24');
    expect(grafana?.startCommand).toContain('--no-deps grafana');
    expect(grafana?.startCommand).not.toContain('replace-with-unique-password');

    const provider = manifest.services.find((service) => service.id === 'provider-cli');
    expect(provider?.healthCheck).toContain('selected configured CLI-backed provider');
    expect(provider?.startCommand).toContain('aider');
    expect(provider?.healthCheck).toContain('aider');
    expect(provider?.healthCheck).toContain('chat surfaces and normal frankenbeast run/agent execution require a CLI-backed provider');
    expect(provider?.startCommand).toContain('explicitly bypass the CLI registry');
    expect(provider?.startCommand).toContain('normal frankenbeast run/agent execution');
    expect(provider?.healthCheck).toContain('authenticated no-op prompt');
    expect(provider?.healthCheck).toContain('Do not treat ANTHROPIC_API_KEY');
    expect(provider?.handoffNote).toContain('outside normal Beast run/chat paths');
    expect(provider?.healthCheck).not.toContain('command -v');

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
      'Full-stack probe: `npm run local:verify-setup` checks ChromaDB, Grafana, and Tempo together',
      'selected CLI-backed provider (`claude`, `codex`, `gemini`, or legacy `aider`) smoke call; do not rely on `command -v` alone',
      'legacy `aider`',
      'chat surfaces currently resolve providers through the CLI provider registry',
      'Tempo can be ready for queries while the OTLP/HTTP listener used by `TempoAdapter` is missing or blocked.',
      "Telegram's `comms.telegram.webhookSecretTokenRef`",
      'do not treat normal `frankenbeast run` or chat as API-key-only',
      'docker compose up -d --no-deps grafana',
      'resolve configured refs through the same store used at runtime',
      'run `detect()`, `keys()`, and resolve each configured secret ref',
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
