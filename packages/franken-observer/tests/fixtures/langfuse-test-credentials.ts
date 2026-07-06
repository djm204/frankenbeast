import { existsSync, readFileSync } from 'node:fs';

function loadRootTestEnv() {
  const testEnvUrl = new URL('../../../../.env.test', import.meta.url);
  if (!existsSync(testEnvUrl)) return;

  for (const rawLine of readFileSync(testEnvUrl, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    const rawValue = line.slice(equalsIndex + 1).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }
}

function testFixture(key: string, ...defaultParts: string[]) {
  return process.env[key] ?? defaultParts.join('-');
}

loadRootTestEnv();

export const LANGFUSE_PUBLIC_KEY = testFixture(
  'FRANKEN_TEST_LANGFUSE_PUBLIC_KEY',
  'langfuse',
  'public',
  'fixture',
);

export const LANGFUSE_SECRET_KEY = testFixture(
  'FRANKEN_TEST_LANGFUSE_SECRET_KEY',
  'langfuse',
  'secret',
  'fixture',
);
