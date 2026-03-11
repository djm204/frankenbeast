import { describe, expect, it } from 'vitest';
import { runCli, commandExists } from '../../../../src/network/secret-backends/cli-runner.js';

describe('cli-runner', () => {
  describe('commandExists', () => {
    it('returns true when command is found', async () => {
      const result = await commandExists('node');
      expect(result).toBe(true);
    });

    it('returns false when command is not found', async () => {
      const result = await commandExists('nonexistent-command-abc123');
      expect(result).toBe(false);
    });
  });

  describe('runCli', () => {
    it('returns stdout from successful command', async () => {
      const result = await runCli('node', ['--version']);
      expect(result.stdout).toMatch(/^v\d+/);
      expect(result.exitCode).toBe(0);
    });

    it('returns error for failed command', async () => {
      const result = await runCli('node', ['-e', 'process.exit(1)']);
      expect(result.exitCode).toBe(1);
    });

    it('throws on command not found', async () => {
      await expect(runCli('nonexistent-command-abc123', [])).rejects.toThrow();
    });
  });
});
