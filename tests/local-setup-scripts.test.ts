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
    expect(read('docs/guides/quickstart.md')).toContain('npm install -g corepack');
    expect(read('docs/guides/quickstart.md')).toContain('corepack enable npm');
    expect(read('docs/guides/quickstart.md')).toContain('npm run check:package-manager');

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

    expect(compose).toContain('/api/v2/heartbeat');
    expect(compose).toContain("'bash',");
    expect(compose).toContain('/dev/tcp/127.0.0.1/8000');
    expect(compose).not.toContain("'curl'");
    expect(compose).not.toContain('http://localhost:8000/api/v1/heartbeat');
  });

  it('pins local compose images and mounts an explicit Tempo config', () => {
    const compose = read('docker-compose.yml');
    const tempoConfig = read('tempo.yaml');

    expect(compose).toContain('image: chromadb/chroma:1.3.7');
    expect(compose).toContain('- chromadb-data:/data');
    expect(compose).toContain('image: grafana/grafana:12.3.8');
    expect(compose).toContain('image: grafana/tempo:2.9.3');
    expect(compose).not.toContain(':latest');
    expect(compose).toContain('- ./tempo.yaml:/etc/tempo.yaml:ro');
    expect(compose).toContain("command: ['-config.file=/etc/tempo.yaml']");

    expect(tempoConfig).toContain('http_listen_port: 3200');
    expect(tempoConfig).toContain('endpoint: 0.0.0.0:4317');
    expect(tempoConfig).toContain('endpoint: 0.0.0.0:4318');
    expect(tempoConfig).toContain('path: /tmp/tempo/wal');
    expect(tempoConfig).toContain('path: /tmp/tempo/blocks');
  });

  it('requires explicit non-default Grafana admin credentials for local compose', () => {
    const compose = read('docker-compose.yml');

    expect(compose).toContain('Set GRAFANA_USER and GRAFANA_PASSWORD before starting Grafana.');
    expect(compose).toContain('Refusing to start Grafana with admin/admin credentials.');
    expect(compose).toContain('admin reset-admin-password "$${GF_SECURITY_ADMIN_PASSWORD}"');
    expect(compose).toContain('GF_SECURITY_ADMIN_USER=${GRAFANA_USER:-}');
    expect(compose).toContain('GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-}');
    expect(compose).not.toContain('${GRAFANA_USER:-admin}');
    expect(compose).not.toContain('${GRAFANA_PASSWORD:-admin}');
    expect(compose).toContain('startup guard resets the persisted admin password');
  });

  it('.env.example documents current local env vars without removed service knobs', () => {
    const envExample = read('.env.example');
    const readme = read('README.md');
    const quickstart = read('docs/guides/quickstart.md');
    const runCliBeastGuide = read('docs/guides/run-cli-beast.md');
    const mcpSuiteReadme = read('packages/franken-mcp-suite/README.md');

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
    expect(envExample).not.toMatch(/^# ── Firewall Server ──$/m);
    expect(envExample).not.toMatch(/^#?\s*FIREWALL_PORT\s*=/m);
    expect(envExample).not.toMatch(/frankenfirewall|firewall proxy|port 9090/i);

    expect(envExample).not.toMatch(/^GRAFANA_USER=admin$/m);
    expect(envExample).not.toMatch(/^GRAFANA_PASSWORD=admin$/m);
    expect(envExample).toContain('Grafana\'s built-in admin/admin default is insecure');
    expect(envExample).toContain('Generate a unique local password before uncommenting');
    expect(envExample).toContain('Do not use VITE_BEAST_OPERATOR_TOKEN');
    expect(envExample).not.toMatch(/^#?\s*VITE_BEAST_OPERATOR_TOKEN=/m);

    for (const doc of [readme, quickstart, runCliBeastGuide]) {
      expect(doc).toContain('ANTHROPIC_API_KEY');
      expect(doc).toContain('OPENAI_API_KEY');
      expect(doc).toContain('GOOGLE_API_KEY');
      expect(doc).toContain('GEMINI_API_KEY');
    }

    expect(readme).toContain('CHROMA_URL');
    expect(readme).toContain('http://localhost:8000');
    expect(readme).toContain('Override it only when ChromaDB runs at a different local port/host or a remote');
    expect(readme).toContain('Local Tempo exposes OTLP/HTTP writes on http://localhost:4318');
    expect(readme).toContain('readiness on http://localhost:3200/ready');
    expect(readme).toContain('does not define a TEMPO_ENDPOINT override');
    expect(readme).toContain('TempoAdapter options');
    expect(readme).toContain('OLLAMA_BASE_URL');
    expect(readme).toContain('http://localhost:11434');
    expect(readme).toContain('not consumed by the current provider schema');
    expect(readme).toContain('intentionally absent from `.env.example`');
    expect(readme).toContain('CLI flags > `FRANKEN_*` env vars > config file > built-in defaults');
    expect(readme).toContain('maxCritiqueIterations * 10000');
    expect(readme).toContain('`frankenbeast init` configures the orchestrator/backend control plane');
    expect(readme).toContain('It is separate from `fbeast mcp init`');
    expect(readme).toContain('frankenbeast init --verify');
    expect(readme).toContain('review token prompts carefully');
    expect(readme).toContain('frankenbeast init --non-interactive');
    expect(readme).toContain('Choose the secret backend before the first init run');
    expect(readme).toContain('{ "network": { "secureBackend": "os-keychain" } }');
    expect(readme).toContain('Chat, Dashboard, and Comms modules');
    expect(readme).toContain('export FRANKENBEAST_PASSPHRASE=<passphrase>');
    expect(readme).toContain('frankenbeast run --config .fbeast/config.json');
    expect(readme).toContain('does not prove every completed step');
    expect(readme).toContain('create a fresh vault, answer wizard prompts, decrypt the secret vault, or resolve secret refs');
    expect(readme).toContain('does not resolve secret refs');
    expect(readme).toContain('leaving it blank can generate a replacement token');
    expect(mcpSuiteReadme).toContain('FRANKENBEAST_CONFIG_FILE=/path/to/your-project/.fbeast/config.json');
    expect(mcpSuiteReadme).toContain('or `FRANKENBEAST_CONFIG_PATH`');
    expect(mcpSuiteReadme).toContain('FRANKENBEAST_PASSPHRASE');
    expect(mcpSuiteReadme).toContain('does not move the local encrypted vault root');
    for (const frankenOverride of [
      'FRANKEN_MAX_TOTAL_TOKENS',
      'FRANKEN_MAX_DURATION_MS',
      'FRANKEN_MAX_CRITIQUE_ITERATIONS',
      'FRANKEN_ENABLE_HEARTBEAT',
      'FRANKEN_ENABLE_TRACING',
      'FRANKEN_ENABLE_REFLECTION',
      'FRANKEN_MIN_CRITIQUE_SCORE',
    ]) {
      expect(readme).toContain(frankenOverride);
    }
  });

  it('keeps the CLI Beast guide aligned with supported Beast activation providers', () => {
    const runCliBeastGuide = read('docs/guides/run-cli-beast.md');
    const beastModeSource = read('packages/franken-mcp-suite/src/cli/beast-mode.ts');

    expect(runCliBeastGuide).toContain('`OLLAMA_BASE_URL` is a legacy/forward-looking endpoint variable');
    expect(runCliBeastGuide).toContain('Setting `OLLAMA_BASE_URL` alone will not enable an Ollama-backed run in this build');
    expect(runCliBeastGuide).toContain('http://localhost:11434');
    expect(runCliBeastGuide).toContain('intentionally leaves `OLLAMA_BASE_URL` out');
    expect(runCliBeastGuide).toContain('current provider schema');
    expect(runCliBeastGuide).toContain('fbeast mcp beast --provider=anthropic-api');
    expect(runCliBeastGuide).toContain('fbeast mcp beast --provider=codex-cli');
    expect(runCliBeastGuide).toContain('fbeast mcp beast --provider=claude-cli');

    const providersMatch = beastModeSource.match(/SUPPORTED_BEAST_PROVIDERS = new Set\(\[([^\]]+)\]\)/);
    expect(providersMatch).not.toBeNull();
    const supportedProviders = providersMatch?.[1] ?? '';
    for (const provider of ['anthropic-api', 'codex-cli', 'claude-cli']) {
      expect(supportedProviders).toContain(provider);
      expect(runCliBeastGuide).toContain(`--provider=${provider}`);
    }
    expect(supportedProviders).not.toContain('ollama');
  });

  it('keeps the root README provider-extension guidance on current provider surfaces', () => {
    const readme = read('README.md');

    expect(readme).not.toContain('Adding a new provider means implementing one `IAdapter` interface');
    expect(readme).not.toContain('implement `IAdapter` in 4 steps');
    expect(readme).not.toMatch(/firewall is a model-agnostic proxy/i);
    expect(readme).toContain('CLI execution/chat providers implement `ICliProvider`');
    expect(readme).toContain('API-backed clients live in the provider registry and config loading paths');
    expect(readme).toContain(
      'add CLI execution providers through `ICliProvider` or API-backed clients through the provider registry',
    );
  });

  it('keeps root AI assistant rule regeneration guidance on the supported workflow source', () => {
    for (const docPath of ['CLAUDE.md', 'GEMINI.md']) {
      const doc = read(docPath);

      expect(doc).toContain('djm204/agent-workflow-skills');
      expect(doc).toContain('package-level `project-outline.md` cleanup is tracked separately');
      expect(doc).toContain('Do not regenerate the root `.cursor/rules/*.mdc` files');
      expect(doc).not.toContain('npx @djm204/agent-skills');
      expect(doc).not.toMatch(/Re-run to update:/i);
    }
  });
});
