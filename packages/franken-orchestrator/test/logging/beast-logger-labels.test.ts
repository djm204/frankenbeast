import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BeastLogger } from '../../src/logging/beast-logger.js';

describe('BeastLogger service labels', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // ── Badge rendering ──

  it('info with source "martin" includes [martin] badge with cyan ANSI codes', () => {
    const logger = new BeastLogger({ verbose: false });
    logger.info('hello', 'martin');

    expect(logSpy).toHaveBeenCalledOnce();
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('\x1b[36m');           // cyan
    expect(output).toContain('[martin]');
    expect(output).toContain('\x1b[0m');             // reset after badge
    expect(output).toContain('hello');
  });

  it('debug with source "git" is suppressed when verbose: false', () => {
    const logger = new BeastLogger({ verbose: false });
    logger.debug('detail', 'git');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('debug with source "git" includes [git] badge when verbose: true', () => {
    const logger = new BeastLogger({ verbose: true });
    logger.debug('detail', 'git');

    expect(logSpy).toHaveBeenCalledOnce();
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('\x1b[33m');           // yellow
    expect(output).toContain('[git]');
    expect(output).toContain('detail');
  });

  it('no badge when source is omitted (backwards compatible)', () => {
    const logger = new BeastLogger({ verbose: false });
    logger.info('plain message');

    expect(logSpy).toHaveBeenCalledOnce();
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).not.toMatch(/\[[a-z]+\]/);        // no [service] badge
    expect(output).toContain('plain message');
  });

  it('info with object data and no source has no badge', () => {
    const logger = new BeastLogger({ verbose: false });
    logger.info('with data', { key: 'value' });

    expect(logSpy).toHaveBeenCalledOnce();
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).not.toMatch(/\x1b\[\d+m\[[a-z]+\]/); // no colored badge
    expect(output).toContain('with data');
    expect(output).toContain('key=value');
  });

  it('info with object data AND source shows badge', () => {
    const logger = new BeastLogger({ verbose: false });
    logger.info('msg', { x: 1 }, 'session');

    expect(logSpy).toHaveBeenCalledOnce();
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('\x1b[32m');           // green for session
    expect(output).toContain('[session]');
    expect(output).toContain('msg');
    expect(output).toContain('x=1');
  });

  // ── Badge color map ──

  const colorMap: Array<[string, string]> = [
    ['martin',    '\x1b[36m'],  // cyan
    ['git',      '\x1b[33m'],  // yellow
    ['observer', '\x1b[35m'],  // magenta
    ['planner',  '\x1b[34m'],  // blue
    ['session',  '\x1b[32m'],  // green
    ['budget',   '\x1b[31m'],  // red
    ['config',   '\x1b[37m'],  // white
  ];

  for (const [service, ansiCode] of colorMap) {
    it(`badge for "${service}" uses correct color`, () => {
      const logger = new BeastLogger({ verbose: false });
      logger.info('test', service);

      const output = logSpy.mock.calls[0]![0] as string;
      expect(output).toContain(`${ansiCode}[${service}]`);
    });
  }

  // ── Badge alignment (max 10 chars) ──

  it('badges are padded to consistent 10-char width', () => {
    const logger = new BeastLogger({ verbose: false });

    logger.info('a', 'git');       // [git]      = 5 chars -> pad to 10
    logger.info('b', 'observer');  // [observer] = 10 chars -> no pad

    const gitOutput = logSpy.mock.calls[0]![0] as string;
    const observerOutput = logSpy.mock.calls[1]![0] as string;

    // Extract badge portion (colored badge + padding + reset)
    // [git] is 5 chars, needs 5 spaces of padding
    // [observer] is 10 chars, needs 0 spaces
    const gitBadgeMatch = gitOutput.match(/\[git\]\s*/);
    const observerBadgeMatch = observerOutput.match(/\[observer\]\s*/);

    expect(gitBadgeMatch).toBeTruthy();
    expect(observerBadgeMatch).toBeTruthy();

    // Strip ANSI to measure plain-text badge width
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    const gitPlain = stripAnsi(gitOutput);
    const obsPlain = stripAnsi(observerOutput);

    // Both should have the badge portion padded to the same width
    const gitBadgePlain = gitPlain.match(/\[[a-z]+\]\s*/)?.[0] ?? '';
    const obsBadgePlain = obsPlain.match(/\[[a-z]+\]\s*/)?.[0] ?? '';
    expect(gitBadgePlain.length).toBe(obsBadgePlain.length);
  });

  // ── warn and error with source ──

  it('warn with source shows colored badge', () => {
    const logger = new BeastLogger({ verbose: false });
    logger.warn('low budget', 'budget');

    expect(logSpy).toHaveBeenCalledOnce();
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('\x1b[31m');           // red for budget
    expect(output).toContain('[budget]');
    expect(output).toContain('low budget');
  });

  it('error with source shows colored badge', () => {
    const logger = new BeastLogger({ verbose: false });
    logger.error('crash', 'observer');

    expect(logSpy).toHaveBeenCalledOnce();
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('\x1b[35m');           // magenta for observer
    expect(output).toContain('[observer]');
    expect(output).toContain('crash');
  });

  // ── info always appears ──

  it('info lines always appear regardless of verbose setting', () => {
    const loggerQuiet = new BeastLogger({ verbose: false });
    const loggerVerbose = new BeastLogger({ verbose: true });

    loggerQuiet.info('quiet msg', 'session');
    loggerVerbose.info('verbose msg', 'session');

    expect(logSpy).toHaveBeenCalledTimes(2);
  });

  // ── debug only in verbose ──

  it('debug lines only appear when verbose: true', () => {
    const quiet = new BeastLogger({ verbose: false });
    const verbose = new BeastLogger({ verbose: true });

    quiet.debug('hidden', 'config');
    expect(logSpy).not.toHaveBeenCalled();

    verbose.debug('visible', 'config');
    expect(logSpy).toHaveBeenCalledOnce();
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('[config]');
    expect(output).toContain('\x1b[37m');           // white for config
  });

  // ── getLogEntries includes badges ──

  it('getLogEntries includes badge text in captured entries', () => {
    const logger = new BeastLogger({ verbose: false, captureForFile: true });
    logger.info('logged', 'planner');

    const entries = logger.getLogEntries();
    expect(entries).toHaveLength(1);
    // File entries are plain text (stripped ANSI) but include badge
    expect(entries[0]).toContain('[planner]');
    expect(entries[0]).toContain('logged');
    // No ANSI codes in file output
    expect(entries[0]).not.toMatch(/\x1b/);
  });

  // ── Unknown source gets default dim color ──

  it('unknown source name still renders a badge', () => {
    const logger = new BeastLogger({ verbose: false });
    logger.info('custom', 'custom-svc');

    expect(logSpy).toHaveBeenCalledOnce();
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('[custom-svc]');
  });
});
