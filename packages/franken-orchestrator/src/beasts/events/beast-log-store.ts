import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export class BeastLogStore {
  constructor(private readonly logDir: string) {}

  async append(
    runId: string,
    attemptId: string,
    stream: 'stdout' | 'stderr',
    message: string,
  ): Promise<void> {
    const filePath = this.resolvePath(runId, attemptId);
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(
        filePath,
        `${JSON.stringify({
          stream,
          message,
          createdAt: new Date().toISOString(),
        })}\n`,
        'utf-8',
      );
    } catch (err) {
      // Log directory may have been removed (e.g., during test cleanup).
      // Swallow ENOENT — logging should never crash the caller.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async read(runId: string, attemptId: string): Promise<string[]> {
    try {
      const raw = await readFile(this.resolvePath(runId, attemptId), 'utf-8');
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private resolvePath(runId: string, attemptId: string): string {
    return join(this.logDir, runId, `${attemptId}.log`);
  }
}
