import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readText = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const currentWorkspacePackageCount = () =>
  readdirSync(resolve(ROOT, 'packages'), { withFileTypes: true }).filter(
    (entry) =>
      entry.isDirectory() && existsSync(resolve(ROOT, 'packages', entry.name, 'package.json')),
  ).length;

describe('issue #3370 workspace package counts', () => {
  it('distinguishes the historical ADR consolidation count from the current inventory', () => {
    const readme = readText('README.md');
    const adr = readText('docs/adr/031-architecture-consolidation-provider-agnostic.md');

    expect(currentWorkspacePackageCount()).toBe(10);
    expect(readme).toContain('currently organized as 10 npm workspace packages');
    expect(readme).toContain('Treat the current ten-package inventory above as authoritative');

    expect(adr).toContain('Historical consolidation (13 → 8 packages at implementation)');
    expect(adr).toContain('[current 10-package inventory](../../README.md#current-workspace-packages)');
    expect(adr).not.toContain('- **13 → 8 packages**:');
  });
});
