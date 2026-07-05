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
      expect(manifest.engines?.node).toBe('>=22.13.0 <23 || >=24.0.0');
    }

    expect(read('scripts/verify-setup.ts')).toContain("check('Node.js >= 22.13.0 <23 || >=24.0.0'");
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
});
