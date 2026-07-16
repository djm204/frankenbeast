const { existsSync, readFileSync, writeFileSync } = require('node:fs');

const file = process.env.CI_RETRY_FIXTURE_COUNTER;
if (!file) {
  console.error('CI_RETRY_FIXTURE_COUNTER is required');
  process.exit(2);
}
const count = existsSync(file) ? Number(readFileSync(file, 'utf8')) + 1 : 1;
writeFileSync(file, String(count));
process.exit(count < 2 ? 7 : 0);
