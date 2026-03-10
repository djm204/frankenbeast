import { describe, it, expect, vi } from 'vitest';
import { PiiGuard, PiiDetectedError } from '../../../src/pii/pii-guard.js';
import type { IPiiScanner, ScanResult } from '../../../src/pii/pii-scanner-interface.js';

function makeScanner(result: ScanResult): IPiiScanner {
  return { scan: vi.fn(async () => result) };
}

describe('PiiGuard', () => {
  it('allows the entry through when scanner returns clean', async () => {
    const guard = new PiiGuard(makeScanner({ clean: true }));
    await expect(guard.check({ foo: 'bar' })).resolves.not.toThrow();
  });

  it('throws PiiDetectedError when scanner returns a hit in block mode', async () => {
    const guard = new PiiGuard(makeScanner({ clean: false, mode: 'block', fields: ['email'] }));
    await expect(guard.check({ email: 'user@example.com' })).rejects.toThrow(PiiDetectedError);
  });

  it('PiiDetectedError contains the field names that triggered it', async () => {
    const guard = new PiiGuard(makeScanner({ clean: false, mode: 'block', fields: ['email', 'phone'] }));
    try {
      await guard.check({ email: 'x', phone: 'y' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PiiDetectedError);
      expect((err as PiiDetectedError).fields).toEqual(['email', 'phone']);
    }
  });

  it('emits pii-detected event with entry and field names', async () => {
    const guard = new PiiGuard(makeScanner({ clean: false, mode: 'block', fields: ['ssn'] }));
    const listener = vi.fn();
    guard.on('pii-detected', listener);
    await guard.check({ ssn: '123' }).catch(() => {});
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0]).toMatchObject({ fields: ['ssn'] });
  });

  it('does NOT emit event when scanner returns clean', async () => {
    const guard = new PiiGuard(makeScanner({ clean: true }));
    const listener = vi.fn();
    guard.on('pii-detected', listener);
    await guard.check({ safe: 'data' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('emits event but does NOT throw in redact mode', async () => {
    const guard = new PiiGuard(makeScanner({ clean: false, mode: 'redact', fields: ['name'] }));
    const listener = vi.fn();
    guard.on('pii-detected', listener);
    await expect(guard.check({ name: 'Alice' })).resolves.not.toThrow();
    expect(listener).toHaveBeenCalledOnce();
  });
});
