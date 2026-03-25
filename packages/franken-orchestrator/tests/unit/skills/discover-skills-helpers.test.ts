import { describe, it, expect } from 'vitest';
import { extractAuthFields } from '../../../src/providers/discover-skills-helpers.js';

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
