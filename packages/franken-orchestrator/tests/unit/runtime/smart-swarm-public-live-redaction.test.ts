import { describe, expect, it } from 'vitest';
import { credentialRedactionNeedles } from '../../e2e/smart-swarm-public-live-redaction.js';

describe('public Smart Swarm acceptance credential redaction', () => {
  it('checks collision-resistant credential material without rejecting ordinary username text', () => {
    const needles = credentialRedactionNeedles({ username: 'operator', password: 'secret-value' });

    expect(needles).not.toContain('operator');
    expect(needles).toContain('secret-value');
    expect(needles).toContain('operator:secret-value');
    expect(needles).toContain(Buffer.from('operator:secret-value').toString('base64'));
  });
});
