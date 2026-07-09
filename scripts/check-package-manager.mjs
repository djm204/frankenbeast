#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageManager = manifest.packageManager;

if (typeof packageManager !== 'string') {
  console.error('package.json must declare packageManager, for example "npm@11.5.1".');
  process.exit(1);
}

const match = packageManager.match(/^npm@(\d+\.\d+\.\d+)$/);
if (!match) {
  console.error(`Unsupported packageManager ${JSON.stringify(packageManager)}; expected an exact npm version like "npm@11.5.1".`);
  process.exit(1);
}

const expected = match[1];
let actual;
try {
  actual = execSync('npm --version', {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim();
} catch (error) {
  console.error('Unable to determine npm version via `npm --version`.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (actual !== expected) {
  console.error(`npm version mismatch: packageManager pins npm@${expected}, but npm --version returned ${actual}.`);
  console.error(`Run \`corepack enable npm && corepack prepare npm@${expected} --activate\` before installing dependencies.`);
  process.exit(1);
}

console.log(`npm ${actual} matches packageManager ${packageManager}.`);
