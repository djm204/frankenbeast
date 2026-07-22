import { describe, it, expect, vi, afterEach } from 'vitest';
import { printUsage } from '../../../src/cli/args.js';

describe('CLI usage text', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('documents the non-interactive approval escape hatch', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});

    printUsage();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1'));
  });

  it('documents plain output and standard no-color environment controls', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});

    printUsage();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('--plain'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('NO_COLOR'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('FORCE_COLOR=0'));
  });
});
