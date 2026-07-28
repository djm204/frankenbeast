import { describe, expect, it } from 'vitest';
import { isPublicIpAddress } from '../../e2e/smart-swarm-public-live-address.js';

describe('public Smart Swarm acceptance address validation', () => {
  it('accepts globally routable unicast addresses and rejects reserved ranges', () => {
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('2001:4860:4860::8888')).toBe(true);
    expect(isPublicIpAddress('192.88.99.1')).toBe(false);
    expect(isPublicIpAddress('2001:db8::1')).toBe(false);
  });
});
