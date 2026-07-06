import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('local setup scripts', () => {
  it('enforces a coherent Node.js minimum across workspace packages and local tooling', () => {
    const packagePaths = [
      'package.json',
      ...readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `packages/${entry.name}/package.json`)
        .filter((rel) => existsSync(join(ROOT, rel))),
    ];

    expect(read('.nvmrc').trim()).toBe('22.13.0');
    expect(read('.npmrc')).toContain('engine-strict=true');

    for (const packagePath of packagePaths) {
      const manifest = JSON.parse(read(packagePath)) as { engines?: { node?: string } };
      expect(manifest.engines?.node).toBe('>=22.13.0 <23 || >=24.0.0 <26');
    }

    expect(read('scripts/verify-setup.ts')).toContain("check('Node.js >=22.13.0 <23 || >=24.0.0 <26'");
  });

  it('verify-setup checks the live Chroma v2 heartbeat and no removed firewall service', () => {
    const source = read('scripts/verify-setup.ts');

    expect(source).toContain('/api/v2/heartbeat');
    expect(source).not.toContain('/api/v1/heartbeat');
    expect(source).not.toContain('localhost:9090');
    expect(source).not.toContain('Firewall server');
  });

  it('seed script uses the Chroma v2 tenant/database collection API', () => {
    const source = read('scripts/seed.ts');

    expect(source).toContain('/api/v2/heartbeat');
    expect(source).toContain('/api/v2/tenants/${tenant}/databases/${database}/collections');
    expect(source).toContain("default_tenant");
    expect(source).toContain("default_database");
    expect(source).not.toContain('/api/v1/collections');
    expect(source).not.toContain('/api/v1/heartbeat');
  });

  it('docker compose healthcheck targets the Chroma v2 heartbeat', () => {
    const compose = read('docker-compose.yml');

    expect(compose).toContain('http://localhost:8000/api/v2/heartbeat');
    expect(compose).not.toContain('http://localhost:8000/api/v1/heartbeat');
  });

  it('requires explicit non-default Grafana admin credentials for local compose', () => {
    const compose = read('docker-compose.yml');

    expect(compose).toContain('Set GRAFANA_USER and GRAFANA_PASSWORD before starting Grafana.');
    expect(compose).toContain('Refusing to start Grafana with admin/admin credentials.');
    expect(compose).toContain('GF_SECURITY_ADMIN_USER=${GRAFANA_USER:-}');
    expect(compose).toContain('GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-}');
    expect(compose).not.toContain('${GRAFANA_USER:-admin}');
    expect(compose).not.toContain('${GRAFANA_PASSWORD:-admin}');
    expect(compose).toContain('reset the\n  # Grafana password or recreate the volume');
  });

  it('.env.example documents current local env vars without removed service knobs', () => {
    const envExample = read('.env.example');

    for (const required of [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GOOGLE_API_KEY',
      'GEMINI_API_KEY',
      'CHROMA_URL',
      'GRAFANA_USER',
      'GRAFANA_PASSWORD',
      'FRANKEN_MAX_TOTAL_TOKENS',
      'FRANKEN_MAX_DURATION_MS',
      'FRANKEN_MAX_CRITIQUE_ITERATIONS',
      'FRANKEN_ENABLE_HEARTBEAT',
      'FRANKEN_ENABLE_TRACING',
      'FRANKEN_ENABLE_REFLECTION',
      'FRANKEN_MIN_CRITIQUE_SCORE',
      'FRANKENBEAST_PASSPHRASE',
      'FRANKENBEAST_BEAST_OPERATOR_TOKEN',
      'FRANKENBEAST_BEAST_DAEMON_URL',
      'FRANKENBEAST_RUN_CONFIG',
      'FRANKENBEAST_MODULE_MEMORY',
      'FRANKENBEAST_MODULE_PLANNER',
      'FRANKENBEAST_MODULE_CRITIQUE',
      'FRANKENBEAST_MODULE_GOVERNOR',
      'FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES',
      'FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL',
    ]) {
      expect(envExample).toContain(required);
    }

    for (const removed of ['OLLAMA_BASE_URL', 'TEMPO_ENDPOINT', 'FIREWALL_PORT']) {
      expect(envExample).not.toContain(removed);
    }

    expect(envExample).not.toMatch(/^GRAFANA_USER=admin$/m);
    expect(envExample).not.toMatch(/^GRAFANA_PASSWORD=admin$/m);
    expect(envExample).toContain('Generate unique local values before uncommenting');
  });
});
