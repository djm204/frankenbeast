import { describe, it, expect, vi } from 'vitest';
import { handleDashboardCommand } from '../../../src/cli/dashboard-cli.js';

describe('handleDashboardCommand()', () => {
  it('starts server and prints URL', async () => {
    const print = vi.fn();
    const startServer = vi.fn().mockResolvedValue({ url: 'http://localhost:3838' });

    await handleDashboardCommand({ startServer, print });

    expect(startServer).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledWith('Starting dashboard...');
    expect(print).toHaveBeenCalledWith('Dashboard available at http://localhost:3838');
  });

  it('propagates server start errors', async () => {
    const print = vi.fn();
    const startServer = vi.fn().mockRejectedValue(new Error('port in use'));

    await expect(
      handleDashboardCommand({ startServer, print }),
    ).rejects.toThrow('port in use');
  });
});
