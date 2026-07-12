import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const readText = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');
const readJson = <T>(relativePath: string): T => JSON.parse(readText(relativePath)) as T;

describe('issue #1023 GitHub issues guide CLI setup docs', () => {
  it('points the issues guide at the supported local frankenbeast link path', () => {
    const guide = readText('docs/guides/fix-github-issues.md');
    const packageJson = readJson<{ scripts?: Record<string, string> }>('package.json');
    const orchestratorPackage = readJson<{ bin?: Record<string, string> }>('packages/franken-orchestrator/package.json');

    expect(packageJson.scripts?.['local:link']).toContain('--workspace=@franken/orchestrator');
    expect(orchestratorPackage.bin).toHaveProperty('frankenbeast');

    expect(guide).toContain('npm run local:link');
    expect(guide).toContain('npm run local:verify-cli');
    expect(guide).toContain('npm run build');
    expect(guide).toContain('npm --workspace @franken/orchestrator exec -- frankenbeast issues --help');
    expect(guide).toContain(
      'npm --workspace @franken/orchestrator exec -- frankenbeast issues --base-dir /path/to/target-repo --repo owner/repo --dry-run',
    );
    expect(guide).toContain(
      'npm --workspace @franken/orchestrator exec -- frankenbeast issues --base-dir /path/to/target-repo --repo owner/repo --label critical',
    );
    expect(guide).toContain('./run-cli-beast.md');
    expect(guide).toContain('include both `--base-dir` and `--repo`');
    expect(guide).toContain('remove it when you are ready to execute approved fixes');
  });

  it('does not recommend a bare root npm link for the frankenbeast binary', () => {
    const guide = readText('docs/guides/fix-github-issues.md');

    expect(guide).not.toMatch(/npm link`?\s+from repo root/i);
    expect(guide).not.toContain('frankenbeast` installed globally (`npm link` from repo root)');
  });
});
