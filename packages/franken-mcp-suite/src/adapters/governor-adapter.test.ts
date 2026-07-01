import { describe, expect, it } from 'vitest';

import { assessAction } from './governor-adapter.js';

describe('assessAction dangerous-pattern matching', () => {
  it('does not flag benign path arguments that merely contain destructive substrings', () => {
    // Forwarded shell commands include benign paths; word-boundary anchoring means
    // `dropdown`/`formatting` must not trip `drop`/`format`.
    expect(assessAction('Bash', 'cat src/dropdown.tsx').decision).toBe('approved');
    expect(assessAction('Bash', 'git diff docs/formatting.md').decision).toBe('approved');
    expect(assessAction('Bash', 'ls undeleted/').decision).toBe('approved');
  });

  it('still flags genuine destructive verbs', () => {
    for (const cmd of ['drop table users', 'format c:', 'delete from accounts', 'rm -rf /tmp/x']) {
      expect(assessAction('Bash', cmd).decision, cmd).not.toBe('approved');
    }
  });
});
