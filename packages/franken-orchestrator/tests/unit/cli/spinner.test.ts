import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Spinner } from '../../../src/cli/spinner.js';

describe('Spinner', () => {
  let writeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeSpy = vi.fn();
  });

  it('writes spinner frame on start', () => {
    const spinner = new Spinner({ write: writeSpy });
    spinner.start('Thinking...');
    expect(writeSpy).toHaveBeenCalled();
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toContain('Thinking...');
    spinner.stop();
  });

  it('stop clears the spinner line and prints final message', () => {
    const spinner = new Spinner({ write: writeSpy });
    spinner.start('Thinking...');
    writeSpy.mockClear();
    spinner.stop('Done (5.0s)');
    expect(writeSpy).toHaveBeenCalled();
    const output = writeSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('Done (5.0s)');
  });

  it('stop without message just clears the line', () => {
    const spinner = new Spinner({ write: writeSpy });
    spinner.start('Working...');
    writeSpy.mockClear();
    spinner.stop();
    expect(writeSpy).toHaveBeenCalled();
  });

  it('does nothing when silent', () => {
    const spinner = new Spinner({ write: writeSpy, silent: true });
    spinner.start('Thinking...');
    spinner.stop('Done');
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('elapsed returns milliseconds since start', async () => {
    const spinner = new Spinner({ write: writeSpy });
    spinner.start('Working...');
    await new Promise(r => setTimeout(r, 50));
    const elapsed = spinner.elapsed();
    expect(elapsed).toBeGreaterThanOrEqual(40);
    spinner.stop();
  });
});
