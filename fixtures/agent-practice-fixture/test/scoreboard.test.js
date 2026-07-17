import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatScoreboard } from '../src/scoreboard.js';

test('formats the scoreboard from highest score to lowest score', () => {
  const result = formatScoreboard([
    { name: 'Ada', score: 2 },
    { name: 'Grace', score: 5 },
    { name: 'Katherine', score: 3 },
  ]);

  assert.equal(result, 'Grace: 5\nKatherine: 3\nAda: 2');
});
