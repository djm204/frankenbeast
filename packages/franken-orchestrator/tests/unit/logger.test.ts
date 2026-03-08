import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleLogger } from '../../src/logger.js';

describe('ConsoleLogger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-02-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('logs info with timestamp and prefix, ignoring data', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new ConsoleLogger({ verbose: false });

    logger.info('hello', { secret: 'ignored' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]?.[0]).toBe(
      '2025-02-01T12:00:00.000Z [beast] hello',
    );
  });

  it('logs debug only when verbose and includes JSON data', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const quiet = new ConsoleLogger({ verbose: false });
    quiet.debug('hidden', { ok: true });

    expect(logSpy).not.toHaveBeenCalled();

    const verbose = new ConsoleLogger({ verbose: true });
    verbose.debug('visible', { ok: true });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]?.[0]).toBe(
      '2025-02-01T12:00:00.000Z [beast:debug] visible {"ok":true}',
    );
  });

  it('logs warn with timestamp and prefix', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new ConsoleLogger({ verbose: false });

    logger.warn('heads up');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toBe(
      '2025-02-01T12:00:00.000Z [beast:warn] heads up',
    );
  });

  it('logs error to stderr with timestamp and prefix', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new ConsoleLogger({ verbose: false });

    logger.error('boom');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toBe(
      '2025-02-01T12:00:00.000Z [beast:error] boom',
    );
  });
});
