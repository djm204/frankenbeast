import { existsSync } from 'node:fs';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let envLoaded = false;

function loadTestEnv(): void {
  if (envLoaded) {
    return;
  }

  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const envPath = resolve(packageRoot, '.env.test');
  if (existsSync(envPath)) {
    config({ path: envPath });
  }

  envLoaded = true;
}

export function testCredential(name: string): string {
  loadTestEnv();
  return process.env[name] ?? generatedTestCredential(name);
}

function generatedTestCredential(name: string): string {
  const slug = name.toLowerCase().replace(/_/g, '-');
  if (name.includes('SLACK_BOT_TOKEN')) {
    return `xoxb-${slug}`;
  }
  return `test-${slug}`;
}
