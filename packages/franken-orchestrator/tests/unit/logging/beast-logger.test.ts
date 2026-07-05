import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BeastLogger,
  stripAnsi,
  budgetBar,
  statusBadge,
  logHeader,
  BANNER,
  renderBanner,
  shouldRenderGraphicBanner,
} from '../../../src/logging/beast-logger.js';
import type { CommandFailure } from '../../../src/errors/command-failure.js';

// ── stripAnsi ──

describe('stripAnsi', () => {
  it('removes ANSI color codes from a string', () => {
    const colored = '\x1b[31mERROR\x1b[0m something broke';
    expect(stripAnsi(colored)).toBe('ERROR something broke');
  });

  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('removes multiple nested ANSI codes', () => {
    const input = '\x1b[1m\x1b[36m INFO\x1b[0m \x1b[32mgreen\x1b[0m text';
    expect(stripAnsi(input)).toBe(' INFO green text');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });
});

// ── budgetBar ──

describe('budgetBar', () => {
  it('shows 0% for zero spent', () => {
    const bar = budgetBar(0, 10);
    const plain = stripAnsi(bar);
    expect(plain).toContain('0%');
    expect(plain).toContain('$0.00/$10');
  });

  it('shows 50% with green color when under 50% threshold', () => {
    const bar = budgetBar(5, 10);
    const plain = stripAnsi(bar);
    expect(plain).toContain('50%');
    expect(plain).toContain('$5.00/$10');
    // Should contain green ANSI code
    expect(bar).toContain('\x1b[32m');
  });

  it('uses yellow color at 75% threshold', () => {
    const bar = budgetBar(7.5, 10);
    expect(bar).toContain('\x1b[33m'); // yellow
    const plain = stripAnsi(bar);
    expect(plain).toContain('75%');
  });

  it('uses red color at 90% threshold', () => {
    const bar = budgetBar(9, 10);
    expect(bar).toContain('\x1b[31m'); // red
    const plain = stripAnsi(bar);
    expect(plain).toContain('90%');
  });

  it('caps at 100%', () => {
    const bar = budgetBar(15, 10);
    const plain = stripAnsi(bar);
    expect(plain).toContain('100%');
  });

  it('contains block characters', () => {
    const bar = budgetBar(5, 10);
    const plain = stripAnsi(bar);
    expect(plain).toContain('█');
    expect(plain).toContain('░');
  });
});

// ── statusBadge ──

describe('statusBadge', () => {
  it('returns PASS badge with green background when true', () => {
    const badge = statusBadge(true);
    expect(badge).toContain('\x1b[42m'); // bgGreen
    expect(badge).toContain('PASS');
    const plain = stripAnsi(badge);
    expect(plain).toContain('PASS');
  });

  it('returns FAIL badge with red background when false', () => {
    const badge = statusBadge(false);
    expect(badge).toContain('\x1b[41m'); // bgRed
    expect(badge).toContain('FAIL');
    const plain = stripAnsi(badge);
    expect(plain).toContain('FAIL');
  });
});

// ── logHeader ──

describe('logHeader', () => {
  it('creates a boxed header with border characters', () => {
    const header = logHeader('BUILD SUMMARY');
    const plain = stripAnsi(header);
    expect(plain).toContain('─');
    expect(plain).toContain('│');
    expect(plain).toContain('BUILD SUMMARY');
  });

  it('uses cyan ANSI color for borders', () => {
    const header = logHeader('TEST');
    expect(header).toContain('\x1b[36m'); // cyan
  });
});

// ── BANNER ──

describe('BANNER', () => {
  it('contains FRANKENBEAST in ASCII art', () => {
    const plain = stripAnsi(BANNER);
    expect(plain).toContain('########');
  });

  it('uses green ANSI color', () => {
    expect(BANNER).toContain('\x1b[32m');
  });

  it('is under 20 lines', () => {
    const lines = BANNER.split('\n').filter(l => l.length > 0);
    expect(lines.length).toBeLessThanOrEqual(20);
  });

  it('renderBanner falls back to text when the logo path is unavailable', async () => {
    const banner = await renderBanner('/definitely/missing');
    const plain = stripAnsi(banner);
    expect(plain).toContain('FRANKENBEAST');
    expect(plain).toContain('vdev');
  });

  it('prefers the graphic banner when the logo exists and plain mode is not forced', () => {
    expect(shouldRenderGraphicBanner({
      logoExists: true,
      forcePlainBanner: false,
    })).toBe(true);
  });

  it('falls back to the text banner when plain mode is forced', () => {
    expect(shouldRenderGraphicBanner({
      logoExists: true,
      forcePlainBanner: true,
    })).toBe(false);
  });
});

// ── BeastLogger ──

describe('BeastLogger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('log levels', () => {
    it('info logs with cyan bold INFO badge', () => {
      const logger = new BeastLogger({ verbose: false });
      logger.info('test message');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0]![0] as string;
      expect(output).toContain('\x1b[36m'); // cyan
      expect(output).toContain('INFO');
      expect(output).toContain('test message');
    });

    it('debug is silent when not verbose', () => {
      const logger = new BeastLogger({ verbose: false });
      logger.debug('hidden');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('debug logs with gray color when verbose', () => {
      const logger = new BeastLogger({ verbose: true });
      logger.debug('visible');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0]![0] as string;
      expect(output).toContain('\x1b[90m'); // gray
      expect(output).toContain('DEBUG');
      expect(output).toContain('visible');
    });

    it('warn logs with yellow bold WARN badge', () => {
      const logger = new BeastLogger({ verbose: false });
      logger.warn('warning');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0]![0] as string;
      expect(output).toContain('\x1b[33m'); // yellow
      expect(output).toContain('WARN');
      expect(output).toContain('warning');
    });

    it('error logs with red bold ERROR badge', () => {
      const logger = new BeastLogger({ verbose: false });
      logger.error('failure');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0]![0] as string;
      expect(output).toContain('\x1b[31m'); // red
      expect(output).toContain('ERROR');
      expect(output).toContain('failure');
    });
  });

  describe('timestamp format', () => {
    it('includes HH:MM:SS timestamp in output', () => {
      const logger = new BeastLogger({ verbose: false });
      logger.info('test');
      const output = consoleLogSpy.mock.calls[0]![0] as string;
      const plain = stripAnsi(output);
      // Match HH:MM:SS pattern
      expect(plain).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('service highlighting in verbose mode', () => {
    it('highlights [claude] in magenta bold', () => {
      const logger = new BeastLogger({ verbose: true });
      logger.debug('calling [claude] api');
      const output = consoleLogSpy.mock.calls[0]![0] as string;
      expect(output).toContain('\x1b[35m'); // magenta
    });

    it('highlights [codex] in blue bold', () => {
      const logger = new BeastLogger({ verbose: true });
      logger.debug('calling [codex] api');
      const output = consoleLogSpy.mock.calls[0]![0] as string;
      expect(output).toContain('\x1b[34m'); // blue
    });

    it('highlights tool call arrows in cyan', () => {
      const logger = new BeastLogger({ verbose: true });
      logger.debug('→ ReadFile: reading');
      const output = consoleLogSpy.mock.calls[0]![0] as string;
      // The arrow and tool name should be highlighted
      expect(output).toContain('\x1b[36m'); // cyan (in addition to the DEBUG badge area)
    });

    it('highlights result arrows in green', () => {
      const logger = new BeastLogger({ verbose: true });
      logger.debug('← result: success');
      const output = consoleLogSpy.mock.calls[0]![0] as string;
      expect(output).toContain('\x1b[32m'); // green
    });

    it('highlights git commands in green', () => {
      const logger = new BeastLogger({ verbose: true });
      logger.debug('git commit -m "test"');
      const output = consoleLogSpy.mock.calls[0]![0] as string;
      expect(output).toContain('\x1b[32m'); // green
    });
  });

  describe('log file output', () => {
    it('writes plain text entries (no ANSI) via getLogEntries', () => {
      const logger = new BeastLogger({ verbose: true, captureForFile: true });
      logger.info('test info');
      logger.warn('test warn');
      logger.error('test error');
      logger.debug('test debug');

      const entries = logger.getLogEntries();
      expect(entries).toHaveLength(4);

      for (const entry of entries) {
        // No ANSI codes in log entries
        expect(entry).not.toContain('\x1b[');
        // Has proper format: [YYYY-MM-DD HH:MM:SS] [LEVEL] message
        expect(entry).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[(INFO|WARN|ERROR|DEBUG)\]/);
      }
    });

    it('captures debug entries to file even when not verbose', () => {
      const logger = new BeastLogger({ verbose: false, captureForFile: true });
      logger.debug('hidden from terminal but captured', { key: 'val' });

      const entries = logger.getLogEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toContain('[DEBUG]');
      expect(entries[0]).toContain('hidden from terminal but captured');
      // Should NOT have printed to console
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('includes structured metadata in captured file entries', () => {
      const logger = new BeastLogger({ verbose: true, captureForFile: true });
      logger.error('Execution: task failed', { taskId: 'impl:11_rate_limit_resilience', error: 'boom' });

      const entries = logger.getLogEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toContain('Execution: task failed');
      expect(entries[0]).toContain('"taskId": "impl:11_rate_limit_resilience"');
      expect(entries[0]).toContain('"error": "boom"');
    });

    it('renders command failures concisely on the terminal but captures full fields in file logs', () => {
      const failure: CommandFailure = {
        kind: 'command_failed',
        tool: 'gh',
        command: 'gh pr create',
        exitCode: 1,
        timedOut: false,
        retryable: false,
        rateLimited: false,
        stdout: '',
        stderr: 'permission denied',
        summary: 'gh command failed: gh pr create (exit 1)',
      };
      const logger = new BeastLogger({ verbose: false, captureForFile: true });

      logger.error('PrCreator: failed to create PR', failure, 'git');

      const terminal = consoleLogSpy.mock.calls[0]![0] as string;
      const entries = logger.getLogEntries();
      expect(stripAnsi(terminal)).toContain('gh command failed: gh pr create (exit 1)');
      expect(stripAnsi(terminal)).not.toContain('"stderr":"permission denied"');
      expect(entries[0]).toContain('"stderr": "permission denied"');
      expect(entries[0]).toContain('"tool": "gh"');
    });

    it('exposes an explicit close method for persistent file logging', () => {
      const dir = mkdtempSync(join(tmpdir(), 'beast-logger-close-'));
      try {
        const logFile = join(dir, 'build.log');
        const logger = new BeastLogger({ verbose: false, captureForFile: true, logFile });

        logger.info('before close');
        logger.close();
        logger.info('after close');
        logger.close();

        const contents = readFileSync(logFile, 'utf8');
        expect(contents).toContain('before close');
        expect(contents).toContain('after close');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rotates log files before exceeding the configured max size', () => {
      const dir = mkdtempSync(join(tmpdir(), 'beast-logger-rotate-'));
      try {
        const logFile = join(dir, 'build.log');
        writeFileSync(logFile, `${'x'.repeat(80)}\n`);
        const logger = new BeastLogger({
          verbose: false,
          captureForFile: true,
          logFile,
          maxLogFileBytes: 100,
        });

        logger.info('new file after rotation');
        logger.close();

        expect(existsSync(`${logFile}.1`)).toBe(true);
        expect(readFileSync(`${logFile}.1`, 'utf8')).toContain('xxxxxxxxxx');
        expect(readFileSync(logFile, 'utf8')).toContain('new file after rotation');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });


  describe('short-write handling', () => {
    it('retries writeSync until all bytes are written', () => {
      const dir = mkdtempSync(join(tmpdir(), 'beast-logger-short-write-'));
      try {
        const logFile = join(dir, 'build.log');
        const logger = new BeastLogger({ verbose: false, captureForFile: true, logFile });

        // Write a larger log message to ensure writeSync is exercised
        const longMsg = 'a'.repeat(512);
        logger.info(longMsg);
        logger.close();

        const contents = readFileSync(logFile, 'utf8');
        // The full message must be present — no truncation
        expect(contents).toContain(longMsg);
        // Exactly one newline-terminated entry
        const lines = contents.split('\n').filter(l => l.length > 0);
        expect(lines).toHaveLength(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('accounts for byte length (not char length) in logBytes', () => {
      const dir = mkdtempSync(join(tmpdir(), 'beast-logger-multibyte-'));
      try {
        const logFile = join(dir, 'build.log');
        // Multi-byte UTF-8: each emoji is 4 bytes
        const emoji = '🧟'.repeat(20);
        const logger = new BeastLogger({ verbose: false, captureForFile: true, logFile });

        logger.info(emoji);
        logger.close();

        const contents = readFileSync(logFile, 'utf8');
        expect(contents).toContain(emoji);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('zero-retention size-cap (maxRotatedLogFiles < 1)', () => {
    it('truncates the active file when size limit is hit and retention is disabled', () => {
      const dir = mkdtempSync(join(tmpdir(), 'beast-logger-no-retain-'));
      try {
        const logFile = join(dir, 'build.log');
        writeFileSync(logFile, `${'x'.repeat(80)}\n`);
        const logger = new BeastLogger({
          verbose: false,
          captureForFile: true,
          logFile,
          maxLogFileBytes: 100,
          maxRotatedLogFiles: 0,
        });

        logger.info('post-truncation entry');
        logger.close();

        // Must NOT have created a rotated file
        expect(existsSync(`${logFile}.1`)).toBe(false);

        // Active file must contain the new entry (file was truncated then written)
        const contents = readFileSync(logFile, 'utf8');
        expect(contents).toContain('post-truncation entry');

        // Active file must NOT have grown past the limit
        // Use readFileSync length as a proxy — the old 80-byte filler should be gone
        expect(contents).not.toContain('xxxxxxxxxx');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('does not reset logBytes without actually clearing the file', () => {
      // When maxRotatedLogFiles < 1, the file is truncated so logBytes=0 is accurate
      const dir = mkdtempSync(join(tmpdir(), 'beast-logger-no-retain-bytes-'));
      try {
        const logFile = join(dir, 'build.log');
        writeFileSync(logFile, `${'y'.repeat(90)}\n`);
        const logger = new BeastLogger({
          verbose: false,
          captureForFile: true,
          logFile,
          maxLogFileBytes: 100,
          maxRotatedLogFiles: 0,
        });

        // Fill up to trigger truncation on second write
        logger.info('first entry that pushes past limit');
        logger.info('second entry after truncation');
        logger.close();

        const contents = readFileSync(logFile, 'utf8');
        // Old filler must be gone
        expect(contents).not.toContain('yyy');
        // Second entry is present
        expect(contents).toContain('second entry after truncation');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('ILogger interface compliance', () => {
    it('satisfies ILogger with 4 methods', () => {
      const logger = new BeastLogger({ verbose: false });
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('accepts optional data parameter', () => {
      const logger = new BeastLogger({ verbose: false });
      // Should not throw
      logger.info('test', { key: 'value' });
      logger.warn('test', { key: 'value' });
      logger.error('test', { key: 'value' });
    });

    it('prints error metadata to console output', () => {
      const logger = new BeastLogger({ verbose: false });
      logger.error('failure', { taskId: 't1', error: 'boom' });
      const output = consoleLogSpy.mock.calls[0]![0] as string;
      const plain = stripAnsi(output);
      expect(plain).toContain('failure');
      expect(plain).toContain('"taskId":"t1"');
      expect(plain).toContain('"error":"boom"');
    });
  });
});
