import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packagesDir = join(root, 'packages');
const docsPath = join(root, 'docs', 'lint-coverage.md');
const docs = existsSync(docsPath) ? readFileSync(docsPath, 'utf8') : '';
const failures = [];

for (const entry of readdirSync(packagesDir, { withFileTypes: true }).filter((dirent) => dirent.isDirectory())) {
  const manifestPath = join(packagesDir, entry.name, 'package.json');
  if (!existsSync(manifestPath)) continue;

  const packagePath = `packages/${entry.name}`;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const lintScript = manifest.scripts?.lint;
  const configExists = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs']
    .some((configName) => existsSync(join(packagesDir, entry.name, configName)));
  const documented = docs.includes(`| \`${manifest.name}\` | \`${packagePath}\` |`);

  if (typeof lintScript !== 'string' || lintScript.trim().length === 0) {
    failures.push(`${packagePath} (${manifest.name}) is missing scripts.lint`);
  }

  if (!configExists) {
    failures.push(`${packagePath} (${manifest.name}) is missing an ESLint config`);
  }

  if (!documented) {
    failures.push(`${packagePath} (${manifest.name}) is missing from docs/lint-coverage.md`);
  }
}

if (!docs.includes('npm run lint')) {
  failures.push('docs/lint-coverage.md must document the root npm run lint gate');
}

if (failures.length > 0) {
  console.error('Workspace lint coverage is incomplete:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Workspace lint coverage is explicit for every package.');
