export type PackageMetadata = {
  version: string;
};

const VERSION_KEY = 'version';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asPackageMetadata(value: unknown): PackageMetadata {
  if (!isRecord(value)) {
    throw new Error('Root package metadata must be a JSON object');
  }

  const candidate = value[VERSION_KEY];
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    throw new Error('Root package metadata must include a non-empty string "version" field');
  }

  return { version: candidate };
}

export function parsePackageMetadata(raw: string): PackageMetadata {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return asPackageMetadata(parsed);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse package metadata JSON: ${error.message}`);
    }
    throw new Error('Failed to parse package metadata JSON');
  }
}
