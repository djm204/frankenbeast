import { describe, expect, it } from 'vitest';
import { parsePackageMetadata } from '../src/config/package-metadata';

describe('parsePackageMetadata', () => {
  it('extracts a valid version from package metadata JSON', () => {
    const metadata = parsePackageMetadata('{"name":"frankenbeast","version":"9.9.9"}');

    expect(metadata.version).toBe('9.9.9');
  });

  it('throws for non-object metadata', () => {
    expect(() => parsePackageMetadata('[]')).toThrow(/must be a JSON object/i);
    expect(() => parsePackageMetadata('"string"')).toThrow(/must be a JSON object/i);
  });

  it('throws for missing version', () => {
    expect(() => parsePackageMetadata('{"name":"frankenbeast"}')).toThrow(/must include a non-empty string "version" field/i);
  });

  it('throws for invalid JSON', () => {
    expect(() => parsePackageMetadata('{broken')).toThrow(/Failed to parse package metadata JSON/i);
  });
});
