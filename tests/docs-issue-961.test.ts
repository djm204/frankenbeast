import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const readText = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');
const readJson = <T>(relativePath: string): T => JSON.parse(readText(relativePath)) as T;

const LOCAL_LINK_DOCS = [
  'docs/guides/quickstart.md',
  'docs/guides/run-cli-beast.md',
  'docs/guides/wrap-external-agent.md',
];

const PATH_STYLE_WORKSPACE_LINKS = [
  'npm link --workspace=packages/franken-mcp-suite',
  'npm link --workspace packages/franken-mcp-suite',
  'npm link --workspace=packages/franken-orchestrator',
  'npm link --workspace packages/franken-orchestrator',
];

describe('issue #961 local CLI linking docs', () => {
  it('uses the canonical local:link script for local checkout setup docs', () => {
    const packageJson = readJson<{ scripts?: Record<string, string> }>('package.json');

    expect(packageJson.scripts?.['local:link']).toBe(
      'npm run build && npm link --workspace=@franken/mcp-suite --workspace=@franken/orchestrator',
    );

    for (const docPath of LOCAL_LINK_DOCS) {
      expect(readText(docPath), `${docPath} should point readers at the repo-root local link helper`).toContain(
        'npm run local:link',
      );
    }
  });

  it('does not document path-style npm link workspace selectors for package workspaces', () => {
    for (const docPath of LOCAL_LINK_DOCS) {
      const doc = readText(docPath);

      for (const staleCommand of PATH_STYLE_WORKSPACE_LINKS) {
        expect(doc, `${docPath} should not include ${staleCommand}`).not.toContain(staleCommand);
      }
    }
  });
});
