import { spawn } from 'node:child_process';
import type { AuthField } from '@franken/types';

export interface CollectResult {
  stdout: string;
  exitCode: number;
}

/**
 * Spawn a CLI command, collect stdout, enforce timeout.
 * Returns empty stdout on any failure.
 */
export async function collectCliOutput(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs = 15_000,
): Promise<CollectResult> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(command, args, {
        env,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: timeoutMs,
      });

      const chunks: Buffer[] = [];
      proc.stdout!.on('data', (chunk: Buffer) => chunks.push(chunk));

      proc.on('error', () => resolve({ stdout: '', exitCode: 1 }));
      proc.on('close', (code) => {
        resolve({
          stdout: Buffer.concat(chunks).toString('utf-8'),
          exitCode: code ?? 1,
        });
      });
    } catch {
      resolve({ stdout: '', exitCode: 1 });
    }
  });
}

const AUTH_PATTERNS = /token|secret|key|password|credential|auth/i;

/**
 * Extract env vars that look like credentials based on naming patterns.
 */
export function extractAuthFields(
  env?: Record<string, string>,
): AuthField[] {
  if (!env) return [];
  return Object.keys(env)
    .filter((key) => AUTH_PATTERNS.test(key))
    .map((key) => ({
      key,
      label: key,
      type: 'secret' as const,
      required: true,
    }));
}
