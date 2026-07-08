import { existsSync, readFileSync } from 'node:fs';

function loadRootTestEnv() {
  const testEnvUrl = new URL('../../../../../.env.test', import.meta.url);
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

function token(key: string, ...defaultParts: string[]) {
  return process.env[key] ?? defaultParts.join('-');
}

loadRootTestEnv();

export const DASHBOARD_OPERATOR_TOKEN = token(
  'FRANKEN_TEST_DASHBOARD_OPERATOR_TOKEN',
  'dashboard',
  'operator',
  'fixture',
);

export const CHAT_OPERATOR_TOKEN = token(
  'FRANKEN_TEST_CHAT_OPERATOR_TOKEN',
  'chat',
  'operator',
  'fixture',
);

export const BEAST_OPERATOR_TOKEN = token(
  'FRANKEN_TEST_BEAST_OPERATOR_TOKEN',
  'beast',
  'operator',
  'fixture',
);

export const SHARED_OPERATOR_TOKEN = token(
  'FRANKEN_TEST_SHARED_OPERATOR_TOKEN',
  'shared',
  'operator',
  'fixture',
);

export const MISMATCH_CHAT_OPERATOR_TOKEN = token(
  'FRANKEN_TEST_MISMATCH_CHAT_OPERATOR_TOKEN',
  'chat',
  'mismatch',
  'fixture',
);

export const MISMATCH_BEAST_OPERATOR_TOKEN = `${MISMATCH_CHAT_OPERATOR_TOKEN}-beast`;
