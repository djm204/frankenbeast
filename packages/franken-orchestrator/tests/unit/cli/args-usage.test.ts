import { describe, it, expect, vi, afterEach } from 'vitest';
import { printUsage } from '../../../src/cli/args.js';

describe('CLI usage text', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('documents the non-interactive approval escape hatch', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    printUsage();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1'));
  });
});
