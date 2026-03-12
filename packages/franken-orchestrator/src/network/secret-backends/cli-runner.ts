import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCli(
  command: string,
  args: string[],
  options?: { env?: Record<string, string> },
): Promise<CliResult> {
  try {
    const result = await execFileAsync(command, args, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      env: options?.env ? { ...process.env, ...options.env } : undefined,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
    };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; code?: number | string };
    if (typeof execError.code === 'number') {
      return {
        stdout: execError.stdout ?? '',
        stderr: execError.stderr ?? '',
        exitCode: execError.code,
      };
    }
    throw error;
  }
}

export async function commandExists(command: string): Promise<boolean> {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = await runCli(whichCmd, [command]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function runCliWithStdin(
  command: string,
  args: string[],
  stdin: string,
  env?: Record<string, string>,
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      env: env ? { ...process.env, ...env } : undefined,
    }, (error, stdout, stderr) => {
      if (error && typeof (error as any).code !== 'number') {
        reject(error);
        return;
      }
      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: (error as any)?.code ?? 0,
      });
    });
    child.stdin?.write(stdin);
    child.stdin?.end();
  });
}
