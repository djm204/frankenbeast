import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readDoc = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

describe('issue #2160 dashboard project id docs', () => {
  it('documents VITE_PROJECT_ID in dashboard chat setup paths', () => {
    for (const guidePath of ['docs/guides/run-dashboard-chat.md', 'docs/guides/deploy-beasts.md']) {
      const guide = readDoc(guidePath);

      expect(guide).toContain('VITE_PROJECT_ID');
      expect(guide).toContain('default');
      expect(guide).toContain('chat session');
    }
  });

  it('keeps a non-secret project id example in the root env template', () => {
    const envExample = readDoc('.env.example');

    expect(envExample).toContain('VITE_PROJECT_ID=my-project');
    expect(envExample).toContain('Defaults to "default" when unset');
    expect(envExample).toContain('Non-secret');
    expect(envExample).not.toMatch(/^\s*VITE_PROJECT_ID\s*=/m);
  });
});