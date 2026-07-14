import { describe, expect, it } from 'vitest';
import {
  isSensitiveLogKey,
  redactLogData,
  redactLogDataWithProvenance,
  redactSensitiveText,
  redactSensitiveTextWithProvenance,
} from '../../../src/logging/redaction.js';

const secretMarker = (...parts: string[]) => parts.join('-');

describe('logging redaction', () => {
  it('treats common credential-bearing key spellings as sensitive', () => {
    expect(isSensitiveLogKey('authorization')).toBe(true);
    expect(isSensitiveLogKey('proxy-authorization')).toBe(true);
    expect(isSensitiveLogKey('apiKey')).toBe(true);
    expect(isSensitiveLogKey('x-api-key')).toBe(true);
    expect(isSensitiveLogKey('normalPath')).toBe(false);
  });

  it('redacts quoted and unquoted inline assignment values as a unit', () => {
    const spacedValue = secretMarker('value', 'with', 'spaces');
    const plainValue = secretMarker('plain', 'token');
    const output = redactSensitiveText(`DATABASE_PASSWORD="${spacedValue}" OPENAI_API_KEY=${plainValue} PATH=/usr/bin`);

    expect(output).toContain('DATABASE_PASSWORD=<redacted>');
    expect(output).toContain('OPENAI_API_KEY=<redacted>');
    expect(output).toContain('PATH=/usr/bin');
    expect(output).not.toContain(spacedValue);
    expect(output).not.toContain(plainValue);
  });

  it('redacts sensitive JSON text keys using normalized key names', () => {
    const apiValue = secretMarker('json', 'token');
    const headerValue = secretMarker('header', 'token');
    const output = redactSensitiveText(`{"apiKey":"${apiValue}","x-api-key":"${headerValue}","name":"franken"}`);

    expect(output).toContain('"apiKey":"<redacted>"');
    expect(output).toContain('"x-api-key":"<redacted>"');
    expect(output).toContain('"name":"franken"');
    expect(output).not.toContain(apiValue);
    expect(output).not.toContain(headerValue);
  });

  it('redacts nested authorization metadata in object logs', () => {
    const output = redactLogData({
      headers: {
        authorization: `Bearer ${secretMarker('credential', 'value')}`,
        'proxy-authorization': `Basic ${secretMarker('proxy', 'value')}`,
      },
      config: { apiKey: secretMarker('api', 'value') },
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

  it('returns secret-free provenance for text redaction decisions', () => {
    const value = secretMarker('dont', 'log', 'me');
    const result = redactSensitiveTextWithProvenance(`OPENAI_API_KEY=${value} PATH=/usr/bin`, '$.message');

    expect(result.value).toBe('OPENAI_API_KEY=<redacted> PATH=/usr/bin');
    expect(result.decisions).toEqual([
      {
        path: '$.message',
        key: 'OPENAI_API_KEY',
        source: 'text-assignment',
        rule: 'sensitive-key',
        replacement: '<redacted>',
      },
    ]);
    expect(JSON.stringify(result.decisions)).not.toContain(value);
  });

  it('returns path-aware provenance for object and nested string redaction decisions', () => {
    const objectValue = secretMarker('object', 'value');
    const textValue = secretMarker('inline', 'value');
    const result = redactLogDataWithProvenance({
      config: { apiKey: objectValue },
      events: [`JWT_SECRET=${textValue}`, 'PATH=/usr/bin'],
    });

    expect(result.value).toEqual({
      config: { apiKey: '<redacted>' },
      events: ['JWT_SECRET=<redacted>', 'PATH=/usr/bin'],
    });
    expect(result.decisions).toEqual([
      {
        path: '$.config.apiKey',
        key: 'apiKey',
        source: 'object-key',
        rule: 'sensitive-key',
        replacement: '<redacted>',
      },
      {
        path: '$.events[0]',
        key: 'JWT_SECRET',
        source: 'text-assignment',
        rule: 'sensitive-key',
        replacement: '<redacted>',
      },
    ]);
    expect(JSON.stringify(result.decisions)).not.toContain(objectValue);
    expect(JSON.stringify(result.decisions)).not.toContain(textValue);
  });

  it('keeps provenance empty when no redaction rule matched', () => {
    const result = redactLogDataWithProvenance({
      path: '/tmp/work',
      message: 'PATH=/usr/bin',
    });

    expect(result.value).toEqual({
      path: '/tmp/work',
      message: 'PATH=/usr/bin',
    });
    expect(result.decisions).toEqual([]);
  });
});
