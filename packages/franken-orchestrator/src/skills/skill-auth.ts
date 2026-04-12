import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export class MissingCredentialError extends Error {
  constructor(
    public readonly varName: string,
    public readonly template: string,
  ) {
    super(
      `Missing credential: ${varName} (from ${template}). ` +
        `Set it in .fbeast/.env or as an environment variable.`,
    );
    this.name = 'MissingCredentialError';
  }
}

export class SkillAuthResolver {
  private readonly envOverrides: Record<string, string>;

  constructor(projectRoot: string) {
    this.envOverrides = loadDotEnv(
      join(projectRoot, '.fbeast', '.env'),
    );
  }

  resolve(template: string): string {
    return template.replace(
      /\$\{([^}]+)\}/g,
      (_match: string, varName: string) => {
        const value =
          this.envOverrides[varName] ?? process.env[varName];
        if (value === undefined) {
          throw new MissingCredentialError(varName, `\${${varName}}`);
        }
        return value;
      },
    );
  }

  resolveConfig(env: Record<string, string>): Record<string, string> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      resolved[key] = this.resolve(value);
    }
    return resolved;
  }

  checkCredentials(
    env: Record<string, string>,
  ): Array<{ var: string; available: boolean }> {
    return Object.entries(env).map(([_key, value]) => {
      const varMatch = value.match(/\$\{([^}]+)\}/);
      if (!varMatch) return { var: _key, available: true };
      const varName = varMatch[1]!;
      return {
        var: varName,
        available: !!(this.envOverrides[varName] ?? process.env[varName]),
      };
    });
  }
}

function loadDotEnv(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) return {};

  const content = readFileSync(envPath, 'utf-8');
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}
