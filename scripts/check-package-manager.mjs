#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

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
const actual = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();

if (actual !== expected) {
  console.error(`npm version mismatch: packageManager pins npm@${expected}, but npm --version returned ${actual}.`);
  console.error(`Run \`corepack enable npm && corepack prepare npm@${expected} --activate\` before installing dependencies.`);
  process.exit(1);
}

console.log(`npm ${actual} matches packageManager ${packageManager}.`);
