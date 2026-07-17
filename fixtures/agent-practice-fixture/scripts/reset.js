import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
copyFileSync(
  resolve(fixtureRoot, 'fixtures/buggy/scoreboard.js'),
  resolve(fixtureRoot, 'src/scoreboard.js'),
);
console.log('Reset agent practice fixture to the intentionally buggy starting state.');
