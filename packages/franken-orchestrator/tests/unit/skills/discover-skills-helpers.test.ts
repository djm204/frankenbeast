import { describe, it, expect } from 'vitest';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractAuthFields, isCliAvailable } from '../../../src/providers/discover-skills-helpers.js';

describe('extractAuthFields', () => {
  it('extracts env vars matching auth patterns', () => {
    const result = extractAuthFields({ GITHUB_TOKEN: 'xxx', PORT: '8080' });
    expect(result).toEqual([
      { key: 'GITHUB_TOKEN', label: 'GITHUB_TOKEN', type: 'secret', required: true },
    ]);
  });

  it('matches token, secret, key, password, credential, auth', () => {
    const result = extractAuthFields({
      API_KEY: 'k',
      DB_PASSWORD: 'p',
      AUTH_TOKEN: 't',
      SIGNING_SECRET: 's',
      MY_CREDENTIAL: 'c',
      PORT: '80',
      HOST: 'localhost',
    });
    expect(result).toHaveLength(5);
    expect(result.map((r) => r.key)).toEqual([
      'API_KEY',
      'DB_PASSWORD',
      'AUTH_TOKEN',
      'SIGNING_SECRET',
      'MY_CREDENTIAL',
    ]);
  });

  it('returns empty array for undefined env', () => {
    expect(extractAuthFields(undefined)).toEqual([]);
  });

  it('returns empty array when no keys match', () => {
    expect(extractAuthFields({ PORT: '80', HOST: 'localhost' })).toEqual([]);
  });
});

describe('isCliAvailable', () => {
  it('returns true when the CLI exits successfully for --version', async () => {
    await expect(isCliAvailable(process.execPath)).resolves.toBe(true);
  });

  it('returns false when the CLI cannot be spawned', async () => {
    await expect(isCliAvailable('definitely-missing-frankenbeast-cli')).resolves.toBe(false);
  });

  it('passes the provided environment to the availability probe', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'franken-cli-availability-'));
    const script = join(dir, 'env-check-cli');
    writeFileSync(
      script,
      '#!/usr/bin/env node\nprocess.exit(process.argv[2] === "--version" && process.env.FRANKEN_CLI_AVAILABLE === "1" ? 0 : 1);\n',
      'utf8',
    );
    chmodSync(script, 0o755);

    await expect(
      isCliAvailable(script, { ...process.env, FRANKEN_CLI_AVAILABLE: '1' }),
    ).resolves.toBe(true);
    await expect(isCliAvailable(script, { ...process.env })).resolves.toBe(false);
  });
});
