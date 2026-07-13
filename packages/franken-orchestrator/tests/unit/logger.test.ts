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
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new ConsoleLogger({ verbose: false });

    logger.info('hello', { secret: 'ignored' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]?.[0]).toBe(
      '2025-02-01T12:00:00.000Z [beast] hello',
    );
  });

  it('logs debug only when verbose and includes JSON data', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

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

  it('redacts secret-like environment data in verbose debug logs', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new ConsoleLogger({ verbose: true });

    logger.debug('env dump OPENAI_API_KEY=sk-test-secret', {
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'sk-test-secret',
      nested: { GITHUB_TOKEN: 'gho_test_secret' },
    });

    const output = logSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('OPENAI_API_KEY=<redacted>');
    expect(output).toContain('"OPENAI_API_KEY":"<redacted>"');
    expect(output).toContain('"GITHUB_TOKEN":"<redacted>"');
    expect(output).toContain('"PATH":"/usr/bin"');
    expect(output).not.toContain('sk-test-secret');
    expect(output).not.toContain('gho_test_secret');
  });

  it('logs warn through the shared output path without calling console.warn', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new ConsoleLogger({ verbose: false });

    logger.warn('heads up');

    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0]?.[0]).toBe(
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
