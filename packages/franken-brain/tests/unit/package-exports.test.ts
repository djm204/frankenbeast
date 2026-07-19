import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = resolve(packageRoot, '../..');

function resolveFromConsumer(specifier: string) {
  return spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', `process.stdout.write(import.meta.resolve(${JSON.stringify(specifier)}))`],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
}

describe('@franken/brain package exports', () => {
  it('exposes only the public root import and type declarations', () => {
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
      exports?: unknown;
    };

    expect(manifest.exports).toEqual({
      '.': {
        import: './dist/index.js',
        types: './dist/index.d.ts',
      },
    });

    const rootResolution = resolveFromConsumer('@franken/brain');
    expect(rootResolution.status).toBe(0);
    expect(rootResolution.stdout).toMatch(
      /\/(?:packages\/franken-brain|node_modules\/@franken\/brain)\/dist\/index\.js$/,
    );

    const deepResolution = resolveFromConsumer('@franken/brain/package.json');
    expect(deepResolution.status).not.toBe(0);
    expect(deepResolution.stderr).toContain('ERR_PACKAGE_PATH_NOT_EXPORTED');
  });
});
