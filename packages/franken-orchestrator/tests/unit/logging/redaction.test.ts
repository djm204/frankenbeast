import { describe, expect, it } from 'vitest';
import { isSensitiveLogKey, redactLogData, redactSensitiveText } from '../../../src/logging/redaction.js';

describe('logging redaction', () => {
  it('treats common credential-bearing key spellings as sensitive', () => {
    expect(isSensitiveLogKey('authorization')).toBe(true);
    expect(isSensitiveLogKey('proxy-authorization')).toBe(true);
    expect(isSensitiveLogKey('apiKey')).toBe(true);
    expect(isSensitiveLogKey('x-api-key')).toBe(true);
    expect(isSensitiveLogKey('normalPath')).toBe(false);
  });

  it('redacts quoted and unquoted inline assignment values as a unit', () => {
    const output = redactSensitiveText('DATABASE_PASSWORD="value with spaces" OPENAI_API_KEY=plain-token PATH=/usr/bin');

    expect(output).toContain('DATABASE_PASSWORD=<redacted>');
    expect(output).toContain('OPENAI_API_KEY=<redacted>');
    expect(output).toContain('PATH=/usr/bin');
    expect(output).not.toContain('value with spaces');
    expect(output).not.toContain('plain-token');
  });

  it('redacts sensitive JSON text keys using normalized key names', () => {
    const output = redactSensitiveText('{"apiKey":"json-token","x-api-key":"header-token","name":"franken"}');

    expect(output).toContain('"apiKey":"<redacted>"');
    expect(output).toContain('"x-api-key":"<redacted>"');
    expect(output).toContain('"name":"franken"');
    expect(output).not.toContain('json-token');
    expect(output).not.toContain('header-token');
  });

  it('redacts nested authorization metadata in object logs', () => {
    const output = redactLogData({
      headers: {
        authorization: 'Bearer credential-value',
        'proxy-authorization': 'Basic proxy-value',
      },
      config: { apiKey: 'provider-key' },
      path: '/tmp/work',
    });

    expect(output).toEqual({
      headers: {
        authorization: '<redacted>',
        'proxy-authorization': '<redacted>',
      },
      config: { apiKey: '<redacted>' },
      path: '/tmp/work',
    });
  });
});
